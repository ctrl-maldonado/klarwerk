"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { checkPasswordStrength, hashPassword, verifyPassword } from "@/modules/auth/password";
import { createSession, destroySession } from "@/modules/auth/session";
import { writeAudit } from "@/modules/audit";
import { createTenant } from "@/modules/tenants/provisioning";
import { syncSystemPrompts } from "@/modules/ai/prompt-store";
import { INDUSTRY_OPTIONS } from "@/modules/industry/profiles";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const loginSchema = z.object({
  email: z.string().email("Bitte eine gültige E-Mail-Adresse eingeben."),
  password: z.string().min(1, "Bitte das Passwort eingeben."),
});

const MAX_FAILED_LOGINS = 8;
const LOCK_MINUTES = 15;

async function clientIp(): Promise<string> {
  const headerList = await headers();
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unbekannt";
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const ip = await clientIp();
  try {
    enforceRateLimit({ key: `login:${ip}`, limit: 10, windowMs: 5 * 60 * 1000 });
  } catch (error) {
    return { error: (error as Error).message };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const genericError = "E-Mail-Adresse oder Passwort ist falsch.";

  if (!user || !user.isActive || user.deletedAt) return { error: genericError };
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: "Das Konto ist vorübergehend gesperrt. Bitte in einigen Minuten erneut versuchen." };
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) {
    const failedLogins = user.failedLogins + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins,
        lockedUntil: failedLogins >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    if (user.tenantId) {
      await writeAudit({
        tenantId: user.tenantId,
        actorType: "USER",
        actorUserId: user.id,
        actorLabel: user.email,
        action: "login_failed",
        result: "failed",
        ip,
      });
    }
    return { error: genericError };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await createSession(user.id);

  if (user.tenantId) {
    await writeAudit({
      tenantId: user.tenantId,
      actorType: "USER",
      actorUserId: user.id,
      actorLabel: user.name,
      action: "login",
      ip,
    });
  }

  const tenant = user.tenantId ? await prisma.tenant.findUnique({ where: { id: user.tenantId } }) : null;
  redirect(tenant?.onboardingCompleted ? "/dashboard" : "/onboarding");
}

const registerSchema = z.object({
  name: z.string().min(2, "Bitte den vollständigen Namen angeben."),
  companyName: z.string().min(2, "Bitte den Firmennamen angeben."),
  industryKey: z.string().min(1),
  email: z.string().email("Bitte eine gültige E-Mail-Adresse eingeben."),
  password: z.string(),
});

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    companyName: String(formData.get("companyName") ?? "").trim(),
    industryKey: String(formData.get("industryKey") ?? "other"),
    email: String(formData.get("email") ?? "").toLowerCase().trim(),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const strength = checkPasswordStrength(parsed.data.password);
  if (!strength.ok) {
    return { error: `Das Passwort braucht ${strength.problems.join(", ")}.` };
  }
  if (!INDUSTRY_OPTIONS.some((option) => option.key === parsed.data.industryKey)) {
    return { error: "Unbekannte Branche." };
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { error: "Für diese E-Mail-Adresse gibt es bereits ein Konto." };

  await syncSystemPrompts();
  const tenant = await createTenant({
    name: parsed.data.companyName,
    industryKey: parsed.data.industryKey,
    email: parsed.data.email,
  });

  const ownerRole = await prisma.role.findFirst({ where: { tenantId: tenant.id, key: "owner" } });
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash: await hashPassword(parsed.data.password),
      roleId: ownerRole?.id,
    },
  });

  await createSession(user.id);
  await writeAudit({
    tenantId: tenant.id,
    actorType: "USER",
    actorUserId: user.id,
    actorLabel: user.name,
    action: "tenant_created",
    entityType: "tenant",
    entityId: tenant.id,
    details: { companyName: tenant.name, industryKey: tenant.industryKey },
    ip: await clientIp(),
  });

  redirect("/onboarding");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuthApi } from "@/modules/auth/context";
import { applyIndustryProfile } from "@/modules/tenants/provisioning";
import { writeAudit } from "@/modules/audit";
import { INDUSTRY_OPTIONS } from "@/modules/industry/profiles";

export interface StepState {
  error?: string;
}

const companySchema = z.object({
  name: z.string().min(2, "Bitte den Firmennamen angeben."),
  street: z.string().optional(),
  zip: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Bitte eine gültige E-Mail-Adresse angeben.").optional().or(z.literal("")),
  website: z.string().optional(),
  employeeCount: z.coerce.number().int().min(0).max(10000).optional(),
});

export async function saveCompanyAction(_prev: StepState, formData: FormData): Promise<StepState> {
  const context = await requireAuthApi();
  context.assert("settings:write");

  const parsed = companySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.tenant.update({
    where: { id: context.tenant.id },
    data: {
      name: parsed.data.name,
      street: parsed.data.street || null,
      zip: parsed.data.zip || null,
      city: parsed.data.city || null,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      website: parsed.data.website || null,
      employeeCount: parsed.data.employeeCount ?? null,
      onboardingStep: 3,
    },
  });
  redirect("/onboarding?step=3");
}

export async function saveIndustryAction(_prev: StepState, formData: FormData): Promise<StepState> {
  const context = await requireAuthApi();
  context.assert("settings:write");

  const industryKey = String(formData.get("industryKey") ?? "");
  if (!INDUSTRY_OPTIONS.some((option) => option.key === industryKey)) return { error: "Bitte eine Branche wählen." };

  await applyIndustryProfile(context.tenant.id, industryKey);
  await prisma.tenant.update({ where: { id: context.tenant.id }, data: { onboardingStep: 4 } });
  await writeAudit({
    tenantId: context.tenant.id,
    actorType: "USER",
    actorUserId: context.user.id,
    actorLabel: context.user.name,
    action: "industry_profile_applied",
    entityType: "tenant",
    entityId: context.tenant.id,
    details: { industryKey },
  });
  redirect("/onboarding?step=4");
}

export async function saveHoursAction(_prev: StepState, formData: FormData): Promise<StepState> {
  const context = await requireAuthApi();
  context.assert("settings:write");

  for (let weekday = 0; weekday < 7; weekday += 1) {
    const isClosed = formData.get(`closed-${weekday}`) === "on";
    const startTime = String(formData.get(`start-${weekday}`) ?? "08:00");
    const endTime = String(formData.get(`end-${weekday}`) ?? "17:00");
    if (!isClosed && startTime >= endTime) {
      return { error: "Der Feierabend muss nach dem Arbeitsbeginn liegen." };
    }
    await prisma.businessHour.upsert({
      where: { tenantId_weekday: { tenantId: context.tenant.id, weekday } },
      update: { startTime, endTime, isClosed },
      create: { tenantId: context.tenant.id, weekday, startTime, endTime, isClosed },
    });
  }
  await prisma.tenant.update({ where: { id: context.tenant.id }, data: { onboardingStep: 5 } });
  redirect("/onboarding?step=5");
}

export async function connectDemoMailboxAction(): Promise<void> {
  const context = await requireAuthApi();
  context.assert("integrations:write");

  await prisma.integration.upsert({
    where: { tenantId_providerKey_type: { tenantId: context.tenant.id, providerKey: "demo", type: "EMAIL" } },
    update: { status: "CONNECTED" },
    create: {
      tenantId: context.tenant.id,
      providerKey: "demo",
      type: "EMAIL",
      status: "CONNECTED",
      accountEmail: context.tenant.email ?? context.user.email,
      displayName: "Demo-Postfach (kein echter Versand)",
      scopes: [],
      config: { note: "Nachrichten werden gespeichert, aber nicht an einen Mailserver übergeben." },
    },
  });
  await writeAudit({
    tenantId: context.tenant.id,
    actorType: "USER",
    actorUserId: context.user.id,
    actorLabel: context.user.name,
    action: "integration_connected",
    entityType: "integration",
    details: { providerKey: "demo", type: "EMAIL" },
  });
  revalidatePath("/onboarding");
}

export async function skipStepAction(formData: FormData): Promise<void> {
  const context = await requireAuthApi();
  const next = Number(formData.get("next") ?? 1);
  await prisma.tenant.update({ where: { id: context.tenant.id }, data: { onboardingStep: next } });
  redirect(`/onboarding?step=${next}`);
}

export async function finishOnboardingAction(_prev: StepState, formData: FormData): Promise<StepState> {
  const context = await requireAuthApi();
  context.assert("settings:write");

  const level = String(formData.get("automationLevel") ?? "SAFE");
  if (!["SAFE", "ASSISTED", "AUTOMATIC"].includes(level)) return { error: "Unbekannter Automatisierungsgrad." };

  await prisma.tenant.update({
    where: { id: context.tenant.id },
    data: { automationLevel: level as "SAFE" | "ASSISTED" | "AUTOMATIC", onboardingCompleted: true, onboardingStep: 8 },
  });
  await writeAudit({
    tenantId: context.tenant.id,
    actorType: "USER",
    actorUserId: context.user.id,
    actorLabel: context.user.name,
    action: "onboarding_completed",
    entityType: "tenant",
    entityId: context.tenant.id,
    details: { automationLevel: level },
  });
  redirect("/dashboard");
}

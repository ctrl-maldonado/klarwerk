"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { requireAuthApi } from "@/modules/auth/context";
import { tenantDb } from "@/lib/tenant-db";
import { writeAudit } from "@/modules/audit";
import { AI_PROVIDERS } from "@/modules/ai/provider-catalog";
import { hashPassword, checkPasswordStrength } from "@/modules/auth/password";
import { revokeAllSessions } from "@/modules/auth/session";

export interface SettingsState {
  error?: string;
  success?: string;
}

const settingsSchema = z.object({
  emailTone: z.enum(["professional", "friendly", "short", "casual"]),
  emailSignature: z.string().max(2000),
  companyVoice: z.string().max(2000),
  automationLevel: z.enum(["SAFE", "ASSISTED", "AUTOMATIC"]),
  minConfidenceCustomerMatch: z.coerce.number().min(0).max(1),
  minConfidenceCategory: z.coerce.number().min(0).max(1),
  minConfidencePriority: z.coerce.number().min(0).max(1),
  minConfidenceExtraction: z.coerce.number().min(0).max(1),
  policyLow: z.enum(["auto", "approve"]),
  policyMedium: z.enum(["auto", "approve"]),
  policyHigh: z.enum(["auto", "approve"]),
});

export async function saveSettingsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  try {
    const context = await requireAuthApi();
    context.assert("settings:write");

    const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    await prisma.tenantSettings.update({
      where: { tenantId: context.tenant.id },
      data: {
        emailTone: parsed.data.emailTone,
        emailSignature: parsed.data.emailSignature,
        companyVoice: parsed.data.companyVoice,
        minConfidenceCustomerMatch: parsed.data.minConfidenceCustomerMatch,
        minConfidenceCategory: parsed.data.minConfidenceCategory,
        minConfidencePriority: parsed.data.minConfidencePriority,
        minConfidenceExtraction: parsed.data.minConfidenceExtraction,
        approvalPolicy: { LOW: parsed.data.policyLow, MEDIUM: parsed.data.policyMedium, HIGH: parsed.data.policyHigh },
      },
    });
    await prisma.tenant.update({
      where: { id: context.tenant.id },
      data: { automationLevel: parsed.data.automationLevel },
    });

    await writeAudit({
      tenantId: context.tenant.id,
      actorType: "USER",
      actorUserId: context.user.id,
      actorLabel: context.user.name,
      action: "settings_updated",
      entityType: "tenant",
      entityId: context.tenant.id,
      details: { automationLevel: parsed.data.automationLevel, emailTone: parsed.data.emailTone },
    });

    revalidatePath("/einstellungen");
    return { success: "Einstellungen gespeichert." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Speichern fehlgeschlagen." };
  }
}

export async function saveAIProviderAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  try {
    const context = await requireAuthApi();
    context.assert("ai:configure");

    const providerKey = String(formData.get("providerKey") ?? "anthropic");
    if (!AI_PROVIDERS[providerKey]) {
      return { error: `Unbekannter Anbieter: ${providerKey}` };
    }
    const catalog = AI_PROVIDERS[providerKey];
    const model = String(formData.get("model") ?? "").trim();
    const apiKey = String(formData.get("apiKey") ?? "").trim();
    const baseUrl = String(formData.get("baseUrl") ?? "").trim();

    const existing = await prisma.aIProviderConfig.findUnique({
      where: { tenantId_providerKey: { tenantId: context.tenant.id, providerKey } },
    });

    // Wer einen Schlüssel hinterlegt, will diesen Anbieter auch benutzen.
    // Sonst bliebe der Zugang gespeichert, aber unwirksam.
    const makeDefault = formData.get("isDefault") === "on" || Boolean(apiKey);

    await prisma.aIProviderConfig.upsert({
      where: { tenantId_providerKey: { tenantId: context.tenant.id, providerKey } },
      update: {
        model: model || existing?.model || catalog.defaultModel,
        baseUrl: baseUrl || null,
        ...(apiKey ? { encryptedApiKey: encryptSecret(apiKey) } : {}),
        isEnabled: true,
        isDefault: makeDefault,
        dataScope: {
          emailContent: formData.get("scope.emailContent") === "on",
          customerData: formData.get("scope.customerData") === "on",
          paymentData: false,
          attachments: formData.get("scope.attachments") === "on",
        },
      },
      create: {
        tenantId: context.tenant.id,
        providerKey,
        name: catalog.label,
        model: model || catalog.defaultModel,
        baseUrl: baseUrl || null,
        ...(apiKey ? { encryptedApiKey: encryptSecret(apiKey) } : {}),
        isDefault: makeDefault,
        isEnabled: true,
      },
    });

    if (makeDefault) {
      await prisma.aIProviderConfig.updateMany({
        where: { tenantId: context.tenant.id, providerKey: { not: providerKey } },
        data: { isDefault: false },
      });
    }

    await writeAudit({
      tenantId: context.tenant.id,
      actorType: "USER",
      actorUserId: context.user.id,
      actorLabel: context.user.name,
      action: "settings_updated",
      entityType: "ai_provider",
      details: { providerKey, model, apiKeyChanged: Boolean(apiKey) },
    });

    revalidatePath("/einstellungen/ai");
    return {
      success: makeDefault
        ? `AI-Zugang gespeichert. ${catalog.label} ist jetzt der aktive Anbieter.`
        : "AI-Zugang gespeichert.",
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Speichern fehlgeschlagen." };
  }
}

/** Wechselt den aktiven Anbieter, ohne dass ein Schlüssel neu eingegeben wird. */
export async function setActiveAIProviderAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  try {
    const context = await requireAuthApi();
    context.assert("ai:configure");

    const providerKey = String(formData.get("providerKey") ?? "");
    const catalog = AI_PROVIDERS[providerKey];
    if (!catalog) return { error: `Unbekannter Anbieter: ${providerKey}` };

    const config = await prisma.aIProviderConfig.findUnique({
      where: { tenantId_providerKey: { tenantId: context.tenant.id, providerKey } },
    });

    // Ohne Zugang bliebe die Auswahl wirkungslos – das lieber sofort sagen (§28).
    if (catalog.requiresKey && !config?.encryptedApiKey) {
      return {
        error: `Für ${catalog.label} ist noch kein API-Schlüssel hinterlegt. Bitte zuerst unten speichern.`,
      };
    }

    await prisma.aIProviderConfig.upsert({
      where: { tenantId_providerKey: { tenantId: context.tenant.id, providerKey } },
      update: { isDefault: true, isEnabled: true },
      create: {
        tenantId: context.tenant.id,
        providerKey,
        name: catalog.label,
        model: catalog.defaultModel,
        isDefault: true,
        isEnabled: true,
      },
    });
    await prisma.aIProviderConfig.updateMany({
      where: { tenantId: context.tenant.id, providerKey: { not: providerKey } },
      data: { isDefault: false },
    });

    await writeAudit({
      tenantId: context.tenant.id,
      actorType: "USER",
      actorUserId: context.user.id,
      actorLabel: context.user.name,
      action: "settings_updated",
      entityType: "ai_provider",
      details: { providerKey, activated: true },
    });

    revalidatePath("/einstellungen/ai");
    return { success: `Aktiver Anbieter: ${catalog.label}.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Umschalten fehlgeschlagen." };
  }
}

export async function toggleAIActionAction(formData: FormData): Promise<void> {
  const context = await requireAuthApi();
  context.assert("ai:configure");
  const db = tenantDb(context.tenant.id);
  const actionId = String(formData.get("actionId"));
  const action = await db.aIAction.findFirst({ where: { id: actionId } });
  if (!action) return;
  await db.aIAction.update({ where: { id: actionId }, data: { isEnabled: !action.isEnabled } });
  await writeAudit({
    tenantId: context.tenant.id,
    actorType: "USER",
    actorUserId: context.user.id,
    actorLabel: context.user.name,
    action: "settings_updated",
    entityType: "ai_action",
    entityId: actionId,
    details: { key: action.key, enabled: !action.isEnabled },
  });
  revalidatePath("/einstellungen/ai");
}

const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  roleKey: z.string().min(1),
  password: z.string(),
});

export async function createUserAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  try {
    const context = await requireAuthApi();
    context.assert("users:write");

    const parsed = userSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: "Bitte alle Felder korrekt ausfüllen." };

    const strength = checkPasswordStrength(parsed.data.password);
    if (!strength.ok) return { error: `Das Passwort braucht ${strength.problems.join(", ")}.` };

    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (existing) return { error: "Diese E-Mail-Adresse wird bereits verwendet." };

    const role = await prisma.role.findFirst({ where: { tenantId: context.tenant.id, key: parsed.data.roleKey } });
    if (!role) return { error: "Unbekannte Rolle." };

    const user = await prisma.user.create({
      data: {
        tenantId: context.tenant.id,
        email: parsed.data.email.toLowerCase(),
        name: parsed.data.name,
        passwordHash: await hashPassword(parsed.data.password),
        roleId: role.id,
      },
    });

    await writeAudit({
      tenantId: context.tenant.id,
      actorType: "USER",
      actorUserId: context.user.id,
      actorLabel: context.user.name,
      action: "user_created",
      entityType: "user",
      entityId: user.id,
      details: { email: user.email, role: role.key },
    });

    revalidatePath("/einstellungen/team");
    return { success: `${user.name} wurde angelegt.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Anlegen fehlgeschlagen." };
  }
}

export async function deactivateUserAction(formData: FormData): Promise<void> {
  const context = await requireAuthApi();
  context.assert("users:write");
  const userId = String(formData.get("userId"));
  if (userId === context.user.id) return;

  const user = await tenantDb(context.tenant.id).user.findFirst({ where: { id: userId } });
  if (!user) return;

  await prisma.user.update({ where: { id: userId }, data: { isActive: !user.isActive } });
  if (user.isActive) await revokeAllSessions(userId);

  await writeAudit({
    tenantId: context.tenant.id,
    actorType: "USER",
    actorUserId: context.user.id,
    actorLabel: context.user.name,
    action: user.isActive ? "user_deactivated" : "user_activated",
    entityType: "user",
    entityId: userId,
    details: { email: user.email },
  });
  revalidatePath("/einstellungen/team");
}

export async function updateRetentionAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  try {
    const context = await requireAuthApi();
    context.assert("settings:write");

    await prisma.tenantSettings.update({
      where: { tenantId: context.tenant.id },
      data: {
        retentionDaysEmails: Math.max(30, Number(formData.get("retentionDaysEmails") ?? 1095)),
        retentionDaysAuditLogs: Math.max(365, Number(formData.get("retentionDaysAuditLogs") ?? 2555)),
        shareCustomerDataWithAI: formData.get("shareCustomerDataWithAI") === "on",
        aiTrainingOptOut: true,
      },
    });

    await writeAudit({
      tenantId: context.tenant.id,
      actorType: "USER",
      actorUserId: context.user.id,
      actorLabel: context.user.name,
      action: "settings_updated",
      entityType: "privacy",
      details: { shareCustomerDataWithAI: formData.get("shareCustomerDataWithAI") === "on" },
    });

    revalidatePath("/einstellungen/datenschutz");
    return { success: "Datenschutzeinstellungen gespeichert." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Speichern fehlgeschlagen." };
  }
}

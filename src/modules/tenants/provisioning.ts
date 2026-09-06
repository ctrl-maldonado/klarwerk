import type { Tenant } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils";
import { SYSTEM_ROLES } from "@/lib/rbac";
import { AI_ACTIONS } from "@/modules/ai/action-catalog";
import { getIndustryProfile } from "@/modules/industry/profiles";
import { PLANS } from "@/modules/billing/usage";
import { DEFAULT_WORKFLOWS } from "@/modules/workflows/definitions";

/**
 * Legt einen Mandanten mit allen Grundkonfigurationen an (§5, §7).
 * Alles, was branchenabhängig ist, kommt aus dem Branchenprofil – nicht aus dem Code.
 */
export async function createTenant(input: {
  name: string;
  industryKey?: string;
  email?: string;
}): Promise<Tenant> {
  const baseSlug = slugify(input.name) || "betrieb";
  let slug = baseSlug;
  let suffix = 1;
  while (await prisma.tenant.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: input.name,
      slug,
      email: input.email,
      industryKey: input.industryKey ?? "other",
      settings: { create: {} },
      subscription: {
        create: {
          plan: "TRIAL",
          status: "TRIALING",
          currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          limits: PLANS[0].limits,
        },
      },
    },
  });

  await applyIndustryProfile(tenant.id, tenant.industryKey);
  await provisionRoles(tenant.id);
  await provisionAIActions(tenant.id);
  await provisionAIProviders(tenant.id);
  await provisionBusinessHours(tenant.id);
  await provisionWorkflows(tenant.id);

  return tenant;
}

export async function provisionRoles(tenantId: string): Promise<void> {
  for (const role of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where: { tenantId_key: { tenantId, key: role.key } },
      update: { name: role.name, description: role.description, permissions: role.permissions },
      create: {
        tenantId,
        key: role.key,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        isSystem: true,
      },
    });
  }
}

export async function provisionAIActions(tenantId: string): Promise<void> {
  for (const action of AI_ACTIONS) {
    await prisma.aIAction.upsert({
      where: { tenantId_key: { tenantId, key: action.key } },
      update: {
        name: action.name,
        description: action.description,
        riskLevel: action.riskLevel,
        requiredPermission: action.requiredPermission,
      },
      create: {
        tenantId,
        key: action.key,
        name: action.name,
        description: action.description,
        riskLevel: action.riskLevel,
        requiresApproval: action.riskLevel !== "LOW",
        requiredPermission: action.requiredPermission,
      },
    });
  }
}

export async function provisionAIProviders(tenantId: string): Promise<void> {
  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  const hasModelKey = hasAnthropicKey || hasOpenAIKey;

  await prisma.aIProviderConfig.upsert({
    where: { tenantId_providerKey: { tenantId, providerKey: "anthropic" } },
    update: {},
    create: {
      tenantId,
      providerKey: "anthropic",
      name: "Anthropic (Claude)",
      model: process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5",
      isDefault: hasAnthropicKey,
      // Ohne Schlüssel freigeschaltet, aber nicht aktiv: so genügt es später,
      // den Schlüssel zu hinterlegen – ohne zweiten, versteckten Schalter.
      isEnabled: true,
      dataScope: { emailContent: true, customerData: true, paymentData: false, attachments: false },
    },
  });
  await prisma.aIProviderConfig.upsert({
    where: { tenantId_providerKey: { tenantId, providerKey: "openai" } },
    update: {},
    create: {
      tenantId,
      providerKey: "openai",
      name: "OpenAI",
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
      isDefault: hasOpenAIKey && !hasAnthropicKey,
      isEnabled: true,
      dataScope: { emailContent: true, customerData: true, paymentData: false, attachments: false },
    },
  });
  await prisma.aIProviderConfig.upsert({
    where: { tenantId_providerKey: { tenantId, providerKey: "demo" } },
    update: {},
    create: {
      tenantId,
      providerKey: "demo",
      name: "Klarwerk Demo-Modus (regelbasiert)",
      model: "klarwerk-demo-rules-v1",
      isDefault: !hasModelKey,
      isEnabled: true,
      dataScope: { emailContent: false, customerData: false, paymentData: false, attachments: false },
    },
  });
}

export async function provisionBusinessHours(tenantId: string): Promise<void> {
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const isWeekend = weekday === 0 || weekday === 6;
    await prisma.businessHour.upsert({
      where: { tenantId_weekday: { tenantId, weekday } },
      update: {},
      create: {
        tenantId,
        weekday,
        startTime: isWeekend ? "09:00" : "08:00",
        endTime: isWeekend ? "12:00" : weekday === 5 ? "15:00" : "17:00",
        isClosed: isWeekend,
      },
    });
  }
}

export async function provisionWorkflows(tenantId: string): Promise<void> {
  for (const definition of DEFAULT_WORKFLOWS) {
    const existing = await prisma.workflow.findUnique({
      where: { tenantId_key: { tenantId, key: definition.key } },
    });
    if (existing) continue;

    await prisma.workflow.create({
      data: {
        tenantId,
        key: definition.key,
        name: definition.name,
        description: definition.description,
        trigger: definition.trigger,
        isActive: definition.isActive,
        steps: {
          create: definition.steps.map((step, index) => ({
            tenantId,
            sortOrder: index,
            type: step.type,
            actionKey: step.actionKey ?? null,
            ...(step.condition ? { condition: step.condition as object } : {}),
            config: (step.config ?? {}) as object,
            label: step.label,
          })),
        },
      },
    });
  }
}

/**
 * Überträgt ein Branchenprofil auf einen Mandanten (§22).
 * Statusliste, E-Mail-Kategorien und Zusatzfelder werden nur ergänzt,
 * bestehende Anpassungen des Betriebs bleiben erhalten.
 */
export async function applyIndustryProfile(tenantId: string, industryKey: string): Promise<void> {
  const profile = getIndustryProfile(industryKey);

  await prisma.industryProfile.upsert({
    where: { tenantId_key: { tenantId, key: profile.key } },
    update: {
      name: profile.name,
      terminology: profile.terminology as unknown as Prisma.InputJsonValue,
      orderCategories: profile.orderCategories as unknown as Prisma.InputJsonValue,
      priorityRules: profile.priorityRules as unknown as Prisma.InputJsonValue,
      fields: profile.fields as unknown as Prisma.InputJsonValue,
      emailTemplates: profile.emailTemplates as unknown as Prisma.InputJsonValue,
      aiInstructions: profile.aiInstructions as unknown as Prisma.InputJsonValue,
      emailCategories: profile.emailCategories as unknown as Prisma.InputJsonValue,
      orderStatuses: profile.orderStatuses as unknown as Prisma.InputJsonValue,
    },
    create: {
      tenantId,
      key: profile.key,
      name: profile.name,
      isSystem: false,
      terminology: profile.terminology as unknown as Prisma.InputJsonValue,
      orderCategories: profile.orderCategories as unknown as Prisma.InputJsonValue,
      priorityRules: profile.priorityRules as unknown as Prisma.InputJsonValue,
      fields: profile.fields as unknown as Prisma.InputJsonValue,
      emailTemplates: profile.emailTemplates as unknown as Prisma.InputJsonValue,
      aiInstructions: profile.aiInstructions as unknown as Prisma.InputJsonValue,
      emailCategories: profile.emailCategories as unknown as Prisma.InputJsonValue,
      orderStatuses: profile.orderStatuses as unknown as Prisma.InputJsonValue,
    },
  });

  for (const [index, status] of profile.orderStatuses.entries()) {
    await prisma.orderStatus.upsert({
      where: { tenantId_key: { tenantId, key: status.key } },
      update: {},
      create: {
        tenantId,
        key: status.key,
        label: status.label,
        color: status.color,
        sortOrder: index,
        isDefault: Boolean(status.isDefault),
        isTerminal: Boolean(status.isTerminal),
      },
    });
  }

  for (const [index, category] of profile.emailCategories.entries()) {
    await prisma.emailCategory.upsert({
      where: { tenantId_key: { tenantId, key: category.key } },
      update: {},
      create: {
        tenantId,
        key: category.key,
        label: category.label,
        color: category.color,
        sortOrder: index,
        isSystem: true,
        aiHint: category.aiHint,
      },
    });
  }

  for (const [index, field] of profile.fields.entries()) {
    await prisma.customField.upsert({
      where: { tenantId_entityType_key: { tenantId, entityType: field.entityType, key: field.key } },
      update: {},
      create: {
        tenantId,
        entityType: field.entityType,
        key: field.key,
        label: field.label,
        type: field.type,
        options: field.options ?? [],
        isRequired: Boolean(field.isRequired),
        sortOrder: index,
        aiHint: field.aiHint ?? "",
      },
    });
  }

  await prisma.tenant.update({ where: { id: tenantId }, data: { industryKey: profile.key } });
}

/** Liest das (ggf. angepasste) Branchenprofil eines Mandanten. */
export async function getTenantIndustryProfile(tenantId: string, industryKey: string) {
  const stored = await prisma.industryProfile.findUnique({
    where: { tenantId_key: { tenantId, key: industryKey } },
  });
  const fallback = getIndustryProfile(industryKey);
  if (!stored) return fallback;
  return {
    key: stored.key,
    name: stored.name,
    terminology: stored.terminology as unknown as Record<string, string>,
    orderCategories: stored.orderCategories as unknown as typeof fallback.orderCategories,
    priorityRules: stored.priorityRules as unknown as typeof fallback.priorityRules,
    fields: stored.fields as unknown as typeof fallback.fields,
    emailCategories: stored.emailCategories as unknown as typeof fallback.emailCategories,
    orderStatuses: stored.orderStatuses as unknown as typeof fallback.orderStatuses,
    emailTemplates: stored.emailTemplates as unknown as typeof fallback.emailTemplates,
    aiInstructions: stored.aiInstructions as unknown as string[],
  };
}

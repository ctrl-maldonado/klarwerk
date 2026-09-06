import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PROMPTS } from "./prompt-catalog";

/**
 * Spiegelt den Prompt-Katalog als Systemvorlagen in die Datenbank (§21).
 * Bestehende Versionen werden nie überschrieben – neue Fassungen erhalten eine
 * neue Versionsnummer, damit Ergebnisqualität und Fehler zuordenbar bleiben.
 */
export async function syncSystemPrompts(): Promise<void> {
  for (const definition of PROMPTS) {
    const existingTemplate = await prisma.promptTemplate.findFirst({
      where: { tenantId: null, key: definition.key },
    });

    const template =
      existingTemplate ??
      (await prisma.promptTemplate.create({
        data: {
          tenantId: null,
          key: definition.key,
          name: definition.name,
          description: definition.description,
          taskKey: definition.taskKey,
        },
      }));

    const existingVersion = await prisma.promptVersion.findUnique({
      where: { templateId_version: { templateId: template.id, version: definition.version } },
    });
    if (existingVersion) continue;

    await prisma.promptVersion.updateMany({ where: { templateId: template.id }, data: { isActive: false } });
    await prisma.promptVersion.create({
      data: {
        templateId: template.id,
        version: definition.version,
        systemPrompt: definition.systemPrompt,
        userTemplate: definition.userTemplate,
        ...(definition.jsonSchema ? { jsonSchema: definition.jsonSchema as Prisma.InputJsonValue } : {}),
        isActive: true,
        notes: "Mit Klarwerk ausgeliefert.",
      },
    });
  }
}

/** Legt eine neue Version eines Prompts an und aktiviert sie. */
export async function createPromptVersion(input: {
  templateId: string;
  systemPrompt: string;
  userTemplate: string;
  jsonSchema?: object | null;
  notes?: string;
}) {
  const latest = await prisma.promptVersion.findFirst({
    where: { templateId: input.templateId },
    orderBy: { version: "desc" },
  });
  await prisma.promptVersion.updateMany({
    where: { templateId: input.templateId },
    data: { isActive: false },
  });
  return prisma.promptVersion.create({
    data: {
      templateId: input.templateId,
      version: (latest?.version ?? 0) + 1,
      systemPrompt: input.systemPrompt,
      userTemplate: input.userTemplate,
      ...(input.jsonSchema ? { jsonSchema: input.jsonSchema as Prisma.InputJsonValue } : {}),
      notes: input.notes ?? "",
      isActive: true,
    },
  });
}

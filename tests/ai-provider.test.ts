import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getAIStatus, resolveProvider, runAITask } from "@/modules/ai/service";
import { OpenAIProvider } from "@/modules/ai/providers/openai";
import { AnthropicProvider } from "@/modules/ai/providers/anthropic";
import { encryptSecret } from "@/lib/crypto";
import { AIProviderNotConfiguredError } from "@/lib/errors";
import { getPrompt, renderTemplate, PROMPTS } from "@/modules/ai/prompt-catalog";
import { createTestTenant, dropTenant } from "./helpers";

describe("AI-Schicht", () => {
  let tenantId: string;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

  beforeAll(async () => {
    process.env.OPENAI_API_KEY = "";
    process.env.ANTHROPIC_API_KEY = "";
    const setup = await createTestTenant();
    tenantId = setup.tenant.id;
  });

  afterAll(async () => {
    process.env.OPENAI_API_KEY = originalKey;
    process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    await dropTenant(tenantId);
  });

  it("fällt ohne Zugangsdaten auf den klar gekennzeichneten Demo-Modus zurück", async () => {
    const { provider } = await resolveProvider(tenantId);
    expect(provider.isDemo).toBe(true);

    const status = await getAIStatus(tenantId);
    expect(status.isDemo).toBe(true);
    expect(status.configured).toBe(false);
    expect(status.message).toContain("Demo-Modus");
  });

  it("meldet einen fehlenden Zugang klar, statt Ergebnisse zu erfinden", async () => {
    const provider = new OpenAIProvider({ apiKey: "", baseUrl: "https://example.invalid", model: "gpt-4o-mini" });
    expect(provider.isConfigured()).toBe(false);
    await expect(
      provider.complete({ taskKey: "test", systemPrompt: "x", userPrompt: "y" }),
    ).rejects.toBeInstanceOf(AIProviderNotConfiguredError);
  });

  it("meldet einen fehlenden Anthropic-Zugang klar, statt Ergebnisse zu erfinden", async () => {
    const provider = new AnthropicProvider({ apiKey: "", model: "claude-opus-5" });
    expect(provider.isConfigured()).toBe(false);
    expect(provider.isDemo).toBe(false);
    await expect(
      provider.complete({ taskKey: "test", systemPrompt: "x", userPrompt: "y" }),
    ).rejects.toBeInstanceOf(AIProviderNotConfiguredError);
  });

  it("benutzt einen hinterlegten Anthropic-Schlüssel, auch ohne Umgebungsvariable", async () => {
    await prisma.aIProviderConfig.updateMany({ where: { tenantId }, data: { isDefault: false } });
    await prisma.aIProviderConfig.update({
      where: { tenantId_providerKey: { tenantId, providerKey: "anthropic" } },
      data: { encryptedApiKey: encryptSecret("sk-ant-test"), isEnabled: true, isDefault: true },
    });

    const { provider } = await resolveProvider(tenantId);
    expect(provider.key).toBe("anthropic");
    expect(provider.isDemo).toBe(false);
    expect(provider.isConfigured()).toBe(true);

    const status = await getAIStatus(tenantId);
    expect(status.isDemo).toBe(false);
    expect(status.configured).toBe(true);

    // Aufräumen: die folgenden Prüfungen erwarten wieder den Demo-Modus.
    await prisma.aIProviderConfig.update({
      where: { tenantId_providerKey: { tenantId, providerKey: "anthropic" } },
      data: { encryptedApiKey: null, isDefault: false },
    });
    await prisma.aIProviderConfig.update({
      where: { tenantId_providerKey: { tenantId, providerKey: "demo" } },
      data: { isDefault: true },
    });
  });

  it("greift auf einen gespeicherten Schlüssel zurück, wenn der aktive Anbieter keinen hat", async () => {
    await prisma.aIProviderConfig.updateMany({ where: { tenantId }, data: { isDefault: false } });
    await prisma.aIProviderConfig.update({
      where: { tenantId_providerKey: { tenantId, providerKey: "openai" } },
      data: { encryptedApiKey: encryptSecret("sk-test"), isEnabled: true, isDefault: false },
    });
    await prisma.aIProviderConfig.update({
      where: { tenantId_providerKey: { tenantId, providerKey: "anthropic" } },
      data: { isDefault: true, isEnabled: true },
    });

    const { provider } = await resolveProvider(tenantId);
    expect(provider.key).toBe("openai");

    await prisma.aIProviderConfig.update({
      where: { tenantId_providerKey: { tenantId, providerKey: "openai" } },
      data: { encryptedApiKey: null },
    });
    await prisma.aIProviderConfig.update({
      where: { tenantId_providerKey: { tenantId, providerKey: "anthropic" } },
      data: { isDefault: false },
    });
    await prisma.aIProviderConfig.update({
      where: { tenantId_providerKey: { tenantId, providerKey: "demo" } },
      data: { isDefault: true },
    });
  });

  it("markiert jedes Demo-Ergebnis im Protokoll", async () => {
    const outcome = await runAITask({
      tenantId,
      promptKey: "email_classifier",
      variables: { categories: "- new_request: Neue Anfrage", subject: "Heizung defekt", body: "funktioniert nicht" },
      context: {
        subject: "Heizung defekt",
        body: "Die Heizung funktioniert nicht mehr.",
        categories: [{ key: "new_request", label: "Neue Anfrage" }],
      },
    });

    expect(outcome.isDemo).toBe(true);
    expect(outcome.execution.isDemo).toBe(true);
    expect(outcome.execution.providerKey).toBe("demo");

    const usage = await prisma.usageRecord.findFirst({ where: { tenantId, metric: "ai_calls" } });
    expect(usage).not.toBeNull();
  });

  it("hält alle Prompts zentral und versioniert vor", async () => {
    expect(PROMPTS.length).toBeGreaterThanOrEqual(6);
    for (const prompt of PROMPTS) {
      const stored = await prisma.promptTemplate.findFirst({
        where: { tenantId: null, key: prompt.key },
        include: { versions: true },
      });
      expect(stored, `Prompt ${prompt.key} fehlt in der Datenbank`).not.toBeNull();
      expect(stored!.versions.some((version) => version.isActive)).toBe(true);
    }
  });

  it("füllt Platzhalter und lässt unbekannte leer", () => {
    const prompt = getPrompt("email_reply");
    expect(prompt.taskKey).toBe("reply_draft");
    expect(renderTemplate("Hallo {{name}}, {{fehlt}}!", { name: "Welt" })).toBe("Hallo Welt, !");
  });
});

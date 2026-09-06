import type { AIExecution } from "@prisma/client";
import { decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { tenantDb } from "@/lib/tenant-db";
import { recordUsage } from "@/modules/billing/usage";
import { getPrompt, renderTemplate } from "./prompt-catalog";
import { AnthropicProvider } from "./providers/anthropic";
import { DemoProvider } from "./providers/demo";
import { OpenAIProvider } from "./providers/openai";
import type { AICompletionResult, AIProvider, AIChatMessage, AIToolSchema } from "./providers/types";

const log = logger.child({ module: "ai" });

export interface ResolvedProvider {
  provider: AIProvider;
  configId?: string;
  /** Welche Daten dürfen an diesen Provider übertragen werden (§31)? */
  dataScope: Record<string, boolean>;
}

/**
 * Wählt den AI-Provider eines Mandanten (§20).
 * Reihenfolge: gewählter Anbieter → anderer Anbieter mit Zugang →
 * Umgebungsvariable → Demo-Modus. Ein bewusst gewählter Demo-Modus bleibt.
 */
export async function resolveProvider(tenantId: string): Promise<ResolvedProvider> {
  const db = tenantDb(tenantId);
  const configs = await db.aIProviderConfig.findMany({ where: { isEnabled: true } });
  const preferred = configs.find((entry) => entry.isDefault) ?? configs[0];

  // 1. Der ausdrücklich gewählte Anbieter, sofern ein Zugang vorliegt.
  const fromPreferred = preferred ? buildProvider(preferred) : null;
  if (fromPreferred) {
    return {
      provider: fromPreferred,
      configId: preferred!.id,
      dataScope: (preferred!.dataScope as Record<string, boolean>) ?? {},
    };
  }

  // 2. Wurde der Demo-Modus bewusst gewählt, bleibt es dabei.
  if (preferred?.providerKey !== "demo") {
    // 3. Sonst: jeder andere freigeschaltete Anbieter mit hinterlegtem Schlüssel.
    //    Verhindert, dass ein gespeicherter Schlüssel unbemerkt ungenutzt bleibt.
    for (const config of configs) {
      if (config.id === preferred?.id) continue;
      const provider = buildProvider(config);
      if (provider) {
        return {
          provider,
          configId: config.id,
          dataScope: (config.dataScope as Record<string, boolean>) ?? {},
        };
      }
    }

    // 4. Zuletzt die Umgebungsvariablen.
    const fromEnv = buildProviderFromEnv();
    if (fromEnv) {
      return {
        provider: fromEnv,
        configId: configs.find((entry) => entry.providerKey === fromEnv.key)?.id ?? preferred?.id,
        dataScope: (preferred?.dataScope as Record<string, boolean>) ?? {
          emailContent: true,
          customerData: true,
          paymentData: false,
          attachments: false,
        },
      };
    }
  }

  return {
    provider: new DemoProvider(),
    configId: configs.find((entry) => entry.providerKey === "demo")?.id,
    dataScope: { emailContent: false, customerData: false, paymentData: false, attachments: false },
  };
}

/** Baut den Anbieter einer Mandantenkonfiguration – oder null, wenn kein Zugang vorliegt. */
function buildProvider(config: {
  providerKey: string;
  encryptedApiKey: string | null;
  baseUrl: string | null;
  model: string;
}): AIProvider | null {
  if (config.providerKey === "openai") {
    const apiKey = config.encryptedApiKey ? decryptSecret(config.encryptedApiKey) : env.openai.apiKey;
    if (!apiKey) return null;
    return new OpenAIProvider({
      apiKey,
      baseUrl: config.baseUrl || env.openai.baseUrl,
      model: config.model || env.openai.model,
    });
  }

  if (config.providerKey === "anthropic") {
    const apiKey = config.encryptedApiKey ? decryptSecret(config.encryptedApiKey) : env.anthropic.apiKey;
    if (!apiKey) return null;
    return new AnthropicProvider({
      apiKey,
      baseUrl: config.baseUrl || env.anthropic.baseUrl,
      model: config.model || env.anthropic.model,
      effort: parseEffort(env.anthropic.effort),
      thinking: env.anthropic.thinking,
      maxRetries: env.anthropic.maxRetries,
      timeoutMs: env.anthropic.timeoutMs,
    });
  }

  return null;
}

function buildProviderFromEnv(): AIProvider | null {
  if (env.anthropic.apiKey) {
    return new AnthropicProvider({
      apiKey: env.anthropic.apiKey,
      baseUrl: env.anthropic.baseUrl,
      model: env.anthropic.model,
      effort: parseEffort(env.anthropic.effort),
      thinking: env.anthropic.thinking,
      maxRetries: env.anthropic.maxRetries,
      timeoutMs: env.anthropic.timeoutMs,
    });
  }
  if (env.openai.apiKey) {
    return new OpenAIProvider({
      apiKey: env.openai.apiKey,
      baseUrl: env.openai.baseUrl,
      model: env.openai.model,
    });
  }
  return null;
}

const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
type Effort = (typeof EFFORT_LEVELS)[number];

function parseEffort(value: string): Effort | undefined {
  return (EFFORT_LEVELS as readonly string[]).includes(value) ? (value as Effort) : undefined;
}

export interface AIStatus {
  providerKey: string;
  label: string;
  model: string;
  isDemo: boolean;
  configured: boolean;
  message: string;
}

export async function getAIStatus(tenantId: string): Promise<AIStatus> {
  const { provider } = await resolveProvider(tenantId);
  return {
    providerKey: provider.key,
    label: provider.label,
    model: provider.model,
    isDemo: provider.isDemo,
    configured: !provider.isDemo && provider.isConfigured(),
    message: provider.isDemo
      ? "Demo-Modus: Die Vorschläge stammen aus festen Regeln, nicht aus einem KI-Modell. Für echte Analysen einen Zugang unter Einstellungen › AI hinterlegen."
      : `Aktiver Anbieter: ${provider.label}, Modell ${provider.model}.`,
  };
}

export interface RunTaskOptions {
  tenantId: string;
  promptKey: string;
  /** Werte für die Platzhalter im Prompt. */
  variables?: Record<string, string | undefined>;
  /** Strukturierter Kontext für den Demo-Provider. */
  context?: Record<string, unknown>;
  entityType?: string;
  entityId?: string;
  tools?: AIToolSchema[];
  messages?: AIChatMessage[];
  temperature?: number;
}

export interface AITaskOutcome<T = Record<string, unknown>> {
  data: T | undefined;
  text: string;
  toolCalls: AICompletionResult["toolCalls"];
  execution: AIExecution;
  isDemo: boolean;
  confidence: number | null;
}

/**
 * Führt eine AI-Aufgabe aus und protokolliert sie vollständig (§19, §45).
 * Fehler werden nie verschluckt – sie landen als AIExecution mit Status FAILED
 * und werden erneut geworfen (§28).
 */
export async function runAITask<T = Record<string, unknown>>(
  options: RunTaskOptions,
): Promise<AITaskOutcome<T>> {
  const db = tenantDb(options.tenantId);
  const prompt = getPrompt(options.promptKey);
  const { provider, configId } = await resolveProvider(options.tenantId);

  const promptVersion = await db.raw.promptVersion.findFirst({
    where: {
      isActive: true,
      template: { key: prompt.key, OR: [{ tenantId: options.tenantId }, { tenantId: null }] },
    },
    orderBy: [{ template: { tenantId: "desc" } }, { version: "desc" }],
  });

  const systemPrompt = renderTemplate(promptVersion?.systemPrompt ?? prompt.systemPrompt, options.variables ?? {});
  const userPrompt = renderTemplate(promptVersion?.userTemplate ?? prompt.userTemplate, options.variables ?? {});
  const jsonSchema = (promptVersion?.jsonSchema as Record<string, unknown> | null) ?? prompt.jsonSchema;

  try {
    const result = await provider.complete({
      taskKey: prompt.taskKey,
      systemPrompt,
      userPrompt,
      messages: options.messages,
      jsonSchema: options.tools?.length ? undefined : jsonSchema,
      schemaName: prompt.key,
      tools: options.tools,
      temperature: options.temperature,
      context: { ...options.context, message: userPrompt },
    });

    const confidence =
      typeof result.data?.confidence === "number" ? (result.data.confidence as number) : null;

    const execution = await db.aIExecution.create({
      data: {
        tenantId: options.tenantId,
        providerId: configId ?? null,
        providerKey: result.providerKey,
        model: result.model,
        taskKey: prompt.taskKey,
        promptVersionId: promptVersion?.id ?? null,
        status: "SUCCESS",
        confidence,
        latencyMs: result.latencyMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costMicroCents: result.costMicroCents,
        isDemo: result.isDemo,
        entityType: options.entityType ?? null,
        entityId: options.entityId ?? null,
        requestSummary: userPrompt.slice(0, 500),
        responseData: (result.data ?? { text: result.text }) as object,
      },
    });

    await recordUsage(options.tenantId, "ai_calls", 1, { taskKey: prompt.taskKey, isDemo: result.isDemo });

    log.info("ai.task.completed", {
      tenantId: options.tenantId,
      taskKey: prompt.taskKey,
      provider: result.providerKey,
      isDemo: result.isDemo,
      latencyMs: result.latencyMs,
      confidence,
    });

    return {
      data: result.data as T | undefined,
      text: result.text,
      toolCalls: result.toolCalls,
      execution,
      isDemo: result.isDemo,
      confidence,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.aIExecution.create({
      data: {
        tenantId: options.tenantId,
        providerId: configId ?? null,
        providerKey: provider.key,
        model: provider.model,
        taskKey: prompt.taskKey,
        promptVersionId: promptVersion?.id ?? null,
        status: "FAILED",
        isDemo: provider.isDemo,
        entityType: options.entityType ?? null,
        entityId: options.entityId ?? null,
        requestSummary: userPrompt.slice(0, 500),
        error: message.slice(0, 1000),
      },
    });
    if (promptVersion) {
      await db.raw.promptVersion.update({
        where: { id: promptVersion.id },
        data: { errorCount: { increment: 1 } },
      });
    }
    log.error("ai.task.failed", { tenantId: options.tenantId, taskKey: prompt.taskKey, error: message });
    throw error;
  }
}

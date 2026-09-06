import Anthropic from "@anthropic-ai/sdk";
import { AIProviderNotConfiguredError } from "@/lib/errors";
import { fromAnthropicData, toAnthropicSchema } from "./anthropic-schema";
import type {
  AICompletionRequest,
  AICompletionResult,
  AIProvider,
  AIToolCall,
} from "./types";

/**
 * Preise in der hausinternen Einheit (US-Dollar je 1 Mio. Token × 10 000),
 * identisch zur Skala in `openai.ts`. Stand: Konfigurationszeitpunkt.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 50000, output: 250000 },
  "claude-opus-4-8": { input: 50000, output: 250000 },
  "claude-sonnet-5": { input: 20000, output: 100000 },
  "claude-haiku-4-5": { input: 10000, output: 50000 },
  "claude-fable-5-1": { input: 100000, output: 500000 },
  default: { input: 50000, output: 250000 },
};

/** Modelle, die den serverseitigen Fallback bei einer Ablehnung unterstützen. */
const SUPPORTS_FALLBACK = new Set(["claude-opus-5", "claude-fable-5-1", "claude-fable-5"]);

/**
 * Modelle, die `output_config.effort` kennen. Ältere und kleinere Modelle –
 * etwa Haiku 4.5 – weisen den Parameter mit HTTP 400 zurück.
 */
const SUPPORTS_EFFORT = new Set([
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-5",
  "claude-fable-5",
  "claude-fable-5-1",
]);

/** Modelle, bei denen sich das Nachdenken abschalten lässt. */
const SUPPORTS_THINKING_OFF = new Set([
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-5",
]);

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

interface AnthropicOptions {
  apiKey: string;
  /** Leer = Standardadresse des SDK. */
  baseUrl?: string;
  model: string;
  /** Denktiefe je Aufgabe. Ohne Angabe entscheidet die API (derzeit „high"). */
  effort?: Effort;
  /**
   * false = Nachdenken abschalten. Spart bei kurzen Auslese-Aufgaben viel Zeit.
   * Bei Werkzeugaufrufen wird es nie abgeschaltet: das Modell schreibt den
   * Aufruf dann gelegentlich in den sichtbaren Text, statt ihn auszuführen.
   */
  thinking?: boolean;
  /** false = kein serverseitiger Ausweich-Durchlauf bei einer Ablehnung. */
  fallbacks?: boolean;
  /**
   * Wie oft das SDK bei Rate-Limits und Serverfehlern still wiederholt.
   * Voreinstellung des SDK ist 2 – mit Backoff werden daraus schnell 60
   * Sekunden, in denen jemand vor dem Bildschirm wartet, ohne zu erfahren,
   * warum. Für eine Oberfläche ist ein klarer Fehler besser als stilles Warten.
   */
  maxRetries?: number;
  /** Obergrenze je Anfrage in Millisekunden. */
  timeoutMs?: number;
}

export class AnthropicProvider implements AIProvider {
  readonly key = "anthropic";
  readonly label = "Anthropic (Claude)";
  readonly isDemo = false;

  constructor(private readonly options: AnthropicOptions) {}

  get model() {
    return this.options.model;
  }

  isConfigured(): boolean {
    return Boolean(this.options.apiKey);
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    if (!this.isConfigured()) {
      throw new AIProviderNotConfiguredError(
        "AI provider not configured. Bitte hinterlegen Sie einen Anthropic-API-Key in den Einstellungen.",
      );
    }

    const started = Date.now();
    const client = new Anthropic({
      apiKey: this.options.apiKey,
      maxRetries: this.options.maxRetries ?? 1,
      timeout: this.options.timeoutMs ?? 60_000,
      ...(this.options.baseUrl ? { baseURL: this.options.baseUrl } : {}),
    });

    const { system, messages } = this.buildMessages(request);

    // `temperature` wird bewusst nicht gesetzt: die aktuellen Claude-Modelle
    // weisen den Parameter mit HTTP 400 zurück. Die Steuerung läuft über `effort`.
    const params: Anthropic.Beta.MessageCreateParams = {
      model: this.options.model,
      max_tokens: request.maxTokens ?? 16000,
      system,
      messages,
    };

    const withTools = Boolean(request.tools?.length);
    const thinkingOff =
      this.options.thinking === false && !withTools && SUPPORTS_THINKING_OFF.has(this.options.model);

    if (this.options.effort && SUPPORTS_EFFORT.has(this.options.model)) {
      // Ohne Nachdenken lehnt die API die oberen Stufen ab.
      const effort =
        thinkingOff && (this.options.effort === "xhigh" || this.options.effort === "max")
          ? "high"
          : this.options.effort;
      params.output_config = { effort };
    }

    if (thinkingOff) {
      params.thinking = { type: "disabled" };
    }

    if (request.jsonSchema) {
      params.output_config = {
        ...params.output_config,
        format: { type: "json_schema", schema: toAnthropicSchema(request.jsonSchema) },
      };
    }

    if (request.tools?.length) {
      params.tools = request.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters as Anthropic.Tool.InputSchema,
      }));
    }

    // Lehnt das Modell eine Anfrage aus Sicherheitsgründen ab, wiederholt die API
    // sie serverseitig auf einem Ausweichmodell, statt ohne Ergebnis abzubrechen.
    if (this.options.fallbacks !== false && SUPPORTS_FALLBACK.has(this.options.model)) {
      params.betas = [FALLBACK_BETA];
      params.fallbacks = "default";
    }

    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create(params);
    } catch (error) {
      if (!request.jsonSchema || !isSchemaRejection(error)) throw error;
      // Die Schema-Prüfung der API hat eine Komplexitätsgrenze, die sich weder
      // dokumentiert noch stabil vorhersagen lässt. Statt die Bearbeitung einer
      // Kundenanfrage daran scheitern zu lassen, wird die Struktur einmal per
      // Anweisung im Prompt verlangt. Ausgelesen wird sie danach genauso (§28).
      const { format: _unused, ...restOutputConfig } = params.output_config ?? {};
      response = await client.beta.messages.create({
        ...params,
        output_config: Object.keys(restOutputConfig).length ? restOutputConfig : undefined,
        system: `${system}\n\n${jsonInstruction(request.jsonSchema)}`,
      });
    }

    if (response.stop_reason === "refusal") {
      const category = response.stop_details?.category ?? "unbekannt";
      throw new Error(
        `Claude hat die Anfrage abgelehnt (Kategorie: ${category}). Es wurde kein Ergebnis erzeugt.`,
      );
    }

    const text = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    const toolCalls: AIToolCall[] = response.content
      .filter((block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use")
      .map((block) => ({
        id: block.id,
        name: block.name,
        arguments: (block.input ?? {}) as Record<string, unknown>,
      }));

    const inputTokens = response.usage.input_tokens ?? 0;
    const outputTokens = response.usage.output_tokens ?? 0;
    const pricing = PRICING[this.options.model] ?? PRICING.default;

    return {
      text,
      data: request.jsonSchema ? (parseAgainst(text, request.jsonSchema) ?? undefined) : undefined,
      toolCalls,
      model: response.model ?? this.options.model,
      providerKey: this.key,
      isDemo: false,
      inputTokens,
      outputTokens,
      costMicroCents: Math.round(
        (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output,
      ),
      latencyMs: Date.now() - started,
    };
  }

  /**
   * Übersetzt das hauseigene Nachrichtenformat in das der Messages-API.
   * Zwei Unterschiede zu OpenAI, die hier abgefangen werden:
   * der Systemprompt ist ein eigenes Feld, und alle Werkzeugergebnisse eines
   * Assistenzzugs müssen in *einer* Nutzernachricht zurückkommen.
   */
  private buildMessages(request: AICompletionRequest): {
    system: string;
    messages: Anthropic.Beta.BetaMessageParam[];
  } {
    const source = request.messages ?? [{ role: "user" as const, content: request.userPrompt ?? "" }];
    const systemParts = [request.systemPrompt];
    const messages: Anthropic.Beta.BetaMessageParam[] = [];

    for (const message of source) {
      if (message.role === "system") {
        systemParts.push(message.content);
        continue;
      }

      if (message.role === "tool") {
        const block: Anthropic.Beta.BetaToolResultBlockParam = {
          type: "tool_result",
          tool_use_id: message.toolCallId ?? "",
          content: message.content,
        };
        const previous = messages[messages.length - 1];
        // Aufeinanderfolgende Werkzeugergebnisse in dieselbe Nachricht bündeln.
        if (previous?.role === "user" && Array.isArray(previous.content)) {
          previous.content.push(block);
        } else {
          messages.push({ role: "user", content: [block] });
        }
        continue;
      }

      if (message.role === "assistant" && message.toolCalls?.length) {
        const content: Anthropic.Beta.BetaContentBlockParam[] = [];
        if (message.content) content.push({ type: "text", text: message.content });
        for (const call of message.toolCalls) {
          content.push({
            type: "tool_use",
            id: call.id,
            name: call.name,
            input: call.arguments,
          });
        }
        messages.push({ role: "assistant", content });
        continue;
      }

      messages.push({ role: message.role, content: message.content });
    }

    return { system: systemParts.filter(Boolean).join("\n\n"), messages };
  }
}

/** Weist die API das Schema selbst ab – im Gegensatz zu einem Inhaltsfehler? */
function isSchemaRejection(error: unknown): boolean {
  if (!(error instanceof Anthropic.BadRequestError)) return false;
  return /schema/i.test(error.message);
}

/** Verlangt dieselbe Struktur per Anweisung, wenn die Schema-Prüfung ausfällt. */
function jsonInstruction(schema: Record<string, unknown>): string {
  return [
    "Antworte ausschließlich mit einem einzigen JSON-Objekt nach diesem Schema.",
    "Kein Fließtext, keine Erklärung, kein Codeblock.",
    JSON.stringify(toAnthropicSchema(schema)),
  ].join("\n");
}

/** Antwort einlesen und die Umschreibungen aus `toAnthropicSchema` rückgängig machen. */
function parseAgainst(value: string, schema: Record<string, unknown>): Record<string, unknown> | null {
  const parsed = safeParse(value);
  if (!parsed) return null;
  const restored = fromAnthropicData(parsed, schema);
  return typeof restored === "object" && restored !== null
    ? (restored as Record<string, unknown>)
    : null;
}

function safeParse(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

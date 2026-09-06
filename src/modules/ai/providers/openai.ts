import { AIProviderNotConfiguredError } from "@/lib/errors";
import type {
  AIChatMessage,
  AICompletionRequest,
  AICompletionResult,
  AIProvider,
  AIToolCall,
} from "./types";

/** Preise in Mikro-Cent je 1000 Token (Stand: Konfigurationszeitpunkt, überschreibbar). */
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 1500, output: 6000 },
  "gpt-4o": { input: 25000, output: 100000 },
  "gpt-4.1-mini": { input: 4000, output: 16000 },
  default: { input: 1500, output: 6000 },
};

interface OpenAIOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export class OpenAIProvider implements AIProvider {
  readonly key = "openai";
  readonly label = "OpenAI";
  readonly isDemo = false;

  constructor(private readonly options: OpenAIOptions) {}

  get model() {
    return this.options.model;
  }

  isConfigured(): boolean {
    return Boolean(this.options.apiKey);
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    if (!this.isConfigured()) {
      throw new AIProviderNotConfiguredError(
        "AI provider not configured. Bitte hinterlegen Sie einen OpenAI-API-Key in den Einstellungen.",
      );
    }

    const started = Date.now();
    const messages = this.buildMessages(request);

    const body: Record<string, unknown> = {
      model: this.options.model,
      messages,
      temperature: request.temperature ?? 0.2,
    };
    if (request.maxTokens) body.max_tokens = request.maxTokens;

    if (request.jsonSchema) {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: request.schemaName ?? request.taskKey,
          strict: false,
          schema: request.jsonSchema,
        },
      };
    }

    if (request.tools?.length) {
      body.tools = request.tools.map((tool) => ({
        type: "function",
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
      }));
      body.tool_choice = "auto";
    }

    const response = await fetch(`${this.options.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenAI-Anfrage fehlgeschlagen (${response.status}): ${detail.slice(0, 500)}`);
    }

    const payload = (await response.json()) as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
        };
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };

    const message = payload.choices?.[0]?.message;
    const text = message?.content ?? "";
    const toolCalls: AIToolCall[] = (message?.tool_calls ?? []).map((call) => ({
      id: call.id,
      name: call.function.name,
      arguments: safeParse(call.function.arguments) ?? {},
    }));

    const inputTokens = payload.usage?.prompt_tokens ?? 0;
    const outputTokens = payload.usage?.completion_tokens ?? 0;
    const pricing = PRICING[this.options.model] ?? PRICING.default;

    return {
      text,
      data: request.jsonSchema ? (safeParse(text) ?? undefined) : undefined,
      toolCalls,
      model: payload.model ?? this.options.model,
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

  private buildMessages(request: AICompletionRequest): unknown[] {
    const messages: AIChatMessage[] = request.messages
      ? [{ role: "system", content: request.systemPrompt }, ...request.messages]
      : [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt ?? "" },
        ];

    return messages.map((message) => {
      if (message.role === "tool") {
        return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
      }
      if (message.role === "assistant" && message.toolCalls?.length) {
        return {
          role: "assistant",
          content: message.content || null,
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: JSON.stringify(call.arguments) },
          })),
        };
      }
      return { role: message.role, content: message.content };
    });
  }
}

function safeParse(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

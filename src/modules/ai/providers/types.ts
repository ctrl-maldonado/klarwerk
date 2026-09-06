/** AI-Modell-Abstraktion (§20). Kein Modell-SDK außerhalb dieses Ordners. */

export interface AIToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: AIToolCall[];
}

export interface AIToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AICompletionRequest {
  taskKey: string;
  systemPrompt: string;
  userPrompt?: string;
  messages?: AIChatMessage[];
  /** Erzwingt strukturierte JSON-Ausgabe nach diesem Schema. */
  jsonSchema?: Record<string, unknown>;
  schemaName?: string;
  tools?: AIToolSchema[];
  temperature?: number;
  maxTokens?: number;
  /** Kontext für den Demo-Provider und für die Protokollierung. */
  context?: Record<string, unknown>;
}

export interface AICompletionResult {
  text: string;
  data?: Record<string, unknown>;
  toolCalls: AIToolCall[];
  model: string;
  providerKey: string;
  isDemo: boolean;
  inputTokens: number;
  outputTokens: number;
  costMicroCents: number;
  latencyMs: number;
}

export interface AIProvider {
  readonly key: string;
  readonly label: string;
  /** true = Ergebnisse stammen nicht von einem echten Modell (§42). */
  readonly isDemo: boolean;
  readonly model: string;
  isConfigured(): boolean;
  complete(request: AICompletionRequest): Promise<AICompletionResult>;
}

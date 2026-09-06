import { formatDateTime, truncate } from "@/lib/utils";
import { runAITask } from "./service";
import { availableToolSchemas, executeAction, type ToolContext } from "./tools";
import type { AIChatMessage } from "./providers/types";

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantResult {
  answer: string;
  steps: Array<{ actionKey: string; summary: string; ok: boolean }>;
  isDemo: boolean;
}

const MAX_TOOL_ROUNDS = 4;

/**
 * AI-Assistent (§38).
 * Antwortet ausschließlich auf Basis der Werkzeuge – kein direkter Datenbankzugriff,
 * keine Daten anderer Mandanten, keine Aktion oberhalb der Rechte des Benutzers.
 */
export async function askAssistant(options: {
  tenantId: string;
  companyName: string;
  industryName: string;
  userId: string;
  userName: string;
  permissions: string[];
  history: AssistantTurn[];
  question: string;
}): Promise<AssistantResult> {
  const tools = await availableToolSchemas(options.tenantId, options.permissions);
  const toolContext: ToolContext = {
    tenantId: options.tenantId,
    actor: { type: "AI", userId: options.userId, label: `Klarwerk-Assistent (${options.userName})` },
    permissions: options.permissions,
  };

  const messages: AIChatMessage[] = [
    ...options.history.map((turn) => ({ role: turn.role, content: turn.content }) as AIChatMessage),
    { role: "user", content: options.question },
  ];

  const steps: AssistantResult["steps"] = [];
  let isDemo = false;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const outcome = await runAITask({
      tenantId: options.tenantId,
      promptKey: "assistant_chat",
      variables: {
        companyName: options.companyName,
        industryName: options.industryName,
        today: formatDateTime(new Date()),
        message: options.question,
      },
      context: { message: options.question },
      messages,
      tools: round < MAX_TOOL_ROUNDS ? tools : undefined,
      temperature: 0.2,
    });

    isDemo = isDemo || outcome.isDemo;

    if (!outcome.toolCalls.length) {
      return { answer: outcome.text || "Dazu habe ich keine Antwort gefunden.", steps, isDemo };
    }

    messages.push({ role: "assistant", content: outcome.text, toolCalls: outcome.toolCalls });

    for (const call of outcome.toolCalls) {
      try {
        const result = await executeAction(call.name, call.arguments, toolContext, "auto");
        steps.push({ actionKey: call.name, summary: result.summary, ok: true });
        messages.push({
          role: "tool",
          toolCallId: call.id,
          content: truncate(JSON.stringify({ summary: result.summary, data: result.data }), 6000),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        steps.push({ actionKey: call.name, summary: message, ok: false });
        messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify({ error: message }) });
      }
    }
  }

  return {
    answer: "Die Anfrage war zu komplex – bitte formulieren Sie sie etwas konkreter.",
    steps,
    isDemo,
  };
}

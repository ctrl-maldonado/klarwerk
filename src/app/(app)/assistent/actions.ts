"use server";

import { requireAuthApi } from "@/modules/auth/context";
import { getTenantIndustryProfile } from "@/modules/tenants/provisioning";
import { askAssistant, type AssistantTurn } from "@/modules/ai/assistant";
import { enforceRateLimit } from "@/lib/rate-limit";

export interface ChatState {
  turns: AssistantTurn[];
  steps?: Array<{ actionKey: string; summary: string; ok: boolean }>;
  error?: string;
  isDemo?: boolean;
}

export async function askAction(prev: ChatState, formData: FormData): Promise<ChatState> {
  const question = String(formData.get("question") ?? "").trim();
  if (!question) return prev;

  try {
    const context = await requireAuthApi();
    context.assert("ai:use");
    enforceRateLimit({ key: `assistant:${context.user.id}`, limit: 30, windowMs: 60_000 });

    const profile = await getTenantIndustryProfile(context.tenant.id, context.tenant.industryKey);
    const result = await askAssistant({
      tenantId: context.tenant.id,
      companyName: context.tenant.name,
      industryName: profile.name,
      userId: context.user.id,
      userName: context.user.name,
      permissions: context.permissions,
      history: prev.turns.slice(-8),
      question,
    });

    return {
      turns: [...prev.turns, { role: "user", content: question }, { role: "assistant", content: result.answer }],
      steps: result.steps,
      isDemo: result.isDemo,
    };
  } catch (error) {
    return {
      turns: [...prev.turns, { role: "user", content: question }],
      error: error instanceof Error ? error.message : "Die Anfrage konnte nicht beantwortet werden.",
    };
  }
}

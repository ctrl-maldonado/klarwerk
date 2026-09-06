"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAuthApi } from "@/modules/auth/context";
import { approve, reject } from "@/modules/approvals";

export interface ApprovalActionState {
  error?: string;
  success?: string;
  results?: Array<{ actionKey: string; summary: string; ok: boolean }>;
}

async function ip() {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function approveAction(
  _prev: ApprovalActionState,
  formData: FormData,
): Promise<ApprovalActionState> {
  try {
    const context = await requireAuthApi();
    context.assert("ai:approve");

    const approvalId = String(formData.get("approvalId"));
    const enabled = formData.getAll("actionId").map(String);
    const note = String(formData.get("note") ?? "").trim() || undefined;

    const overrides: Record<string, Record<string, unknown>> = {};
    for (const [key, value] of formData.entries()) {
      const match = key.match(/^override\.([^.]+)\.(.+)$/);
      if (match && typeof value === "string" && value.trim()) {
        overrides[match[1]] ??= {};
        overrides[match[1]][match[2]] = value;
      }
    }

    const outcome = await approve(
      context.tenant.id,
      approvalId,
      { userId: context.user.id, label: context.user.name, permissions: context.permissions, ip: await ip() },
      { enabledActionIds: enabled.length ? enabled : undefined, overrides, note },
    );

    revalidatePath("/freigaben");
    revalidatePath("/dashboard");
    revalidatePath("/emails");

    const failed = outcome.results.filter((result) => !result.ok);
    return failed.length
      ? { error: `Nicht alle Schritte konnten ausgeführt werden: ${failed[0].summary}`, results: outcome.results }
      : { success: "Freigegeben und ausgeführt.", results: outcome.results };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unbekannter Fehler." };
  }
}

export async function rejectAction(
  _prev: ApprovalActionState,
  formData: FormData,
): Promise<ApprovalActionState> {
  try {
    const context = await requireAuthApi();
    context.assert("ai:approve");
    await reject(
      context.tenant.id,
      String(formData.get("approvalId")),
      { userId: context.user.id, label: context.user.name, permissions: context.permissions, ip: await ip() },
      String(formData.get("note") ?? "").trim() || undefined,
    );
    revalidatePath("/freigaben");
    revalidatePath("/dashboard");
    return { success: "Vorschlag abgelehnt." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unbekannter Fehler." };
  }
}

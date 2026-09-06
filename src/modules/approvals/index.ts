import type { ApprovalRequest, RiskLevel } from "@prisma/client";
import { AppError, NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { tenantDb } from "@/lib/tenant-db";
import { writeAudit } from "@/modules/audit";
import { notify } from "@/modules/notifications";
import { executeAction, type ToolContext } from "@/modules/ai/tools";

const log = logger.child({ module: "approvals" });

export interface ProposedAction {
  /** Lokale ID innerhalb der Freigabe, für Verweise zwischen Schritten. */
  id: string;
  actionKey: string;
  label: string;
  args: Record<string, unknown>;
  riskLevel: RiskLevel;
  confidence?: number | null;
  /** Vom Benutzer abwählbar. */
  optional?: boolean;
  enabled?: boolean;
}

export interface CreateApprovalInput {
  tenantId: string;
  title: string;
  summary: string;
  riskLevel: RiskLevel;
  actions: ProposedAction[];
  context?: Record<string, unknown>;
  sourceType?: string;
  sourceId?: string;
  workflowRunId?: string;
}

export async function createApproval(input: CreateApprovalInput): Promise<ApprovalRequest> {
  const db = tenantDb(input.tenantId);
  const approval = await db.approvalRequest.create({
    data: {
      tenantId: input.tenantId,
      title: input.title,
      summary: input.summary,
      riskLevel: input.riskLevel,
      status: "PENDING",
      proposedActions: input.actions as unknown as object,
      context: (input.context ?? {}) as object,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      workflowRunId: input.workflowRunId ?? null,
    },
  });

  await notify({
    tenantId: input.tenantId,
    type: "approval_requested",
    title: "Klarwerk benötigt deine Freigabe.",
    body: input.title,
    level: input.riskLevel === "HIGH" ? "WARNING" : "INFO",
    link: `/freigaben/${approval.id}`,
  });

  await writeAudit({
    tenantId: input.tenantId,
    actorType: "AI",
    actorLabel: "Klarwerk",
    action: "approval_requested",
    entityType: "approval",
    entityId: approval.id,
    details: { title: input.title, actions: input.actions.map((action) => action.actionKey) },
  });

  return approval;
}

/**
 * Löst Verweise zwischen Schritten auf: "$ref:step1.id" wird durch das Ergebnis
 * eines vorher ausgeführten Schrittes ersetzt.
 */
function resolveReferences(
  args: Record<string, unknown>,
  results: Record<string, { data: any }>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string" && value.startsWith("$ref:")) {
      const path = value.slice(5).split(".");
      const [stepId, ...rest] = path;
      let current: any = results[stepId]?.data;
      for (const segment of rest) current = current?.[segment];
      if (current !== undefined && current !== null) resolved[key] = current;
      continue;
    }
    if (value !== undefined && value !== null && value !== "") resolved[key] = value;
  }
  return resolved;
}

export interface DecisionActor {
  userId: string;
  label: string;
  permissions: string[];
  ip?: string | null;
}

export interface ApprovalOutcome {
  approval: ApprovalRequest;
  results: Array<{ actionKey: string; summary: string; ok: boolean; error?: string }>;
}

/** Freigabe erteilen und die vorgemerkten Aktionen ausführen (§17). */
export async function approve(
  tenantId: string,
  approvalId: string,
  actor: DecisionActor,
  options: { enabledActionIds?: string[]; overrides?: Record<string, Record<string, unknown>>; note?: string } = {},
): Promise<ApprovalOutcome> {
  const db = tenantDb(tenantId);
  const approval = await db.approvalRequest.findFirst({ where: { id: approvalId } });
  if (!approval) throw new NotFoundError("Freigabe nicht gefunden.");
  if (approval.status !== "PENDING" && approval.status !== "FAILED") {
    throw new AppError(`Diese Freigabe wurde bereits bearbeitet (${approval.status}).`, 409, "already_decided");
  }

  const actions = (approval.proposedActions as unknown as ProposedAction[]) ?? [];
  const selected = actions.filter(
    (action) => !options.enabledActionIds || options.enabledActionIds.includes(action.id),
  );

  const toolContext: ToolContext = {
    tenantId,
    actor: { type: "AI", userId: actor.userId, label: "Klarwerk (freigegeben)" },
    permissions: actor.permissions,
    approvalRequestId: approval.id,
    ip: actor.ip ?? null,
  };

  const results: ApprovalOutcome["results"] = [];
  const byStep: Record<string, { data: any }> = {};
  let failed = false;

  for (const action of selected) {
    if (failed) {
      results.push({ actionKey: action.actionKey, summary: "Übersprungen, weil ein vorheriger Schritt fehlgeschlagen ist.", ok: false });
      continue;
    }
    try {
      const args = resolveReferences({ ...action.args, ...(options.overrides?.[action.id] ?? {}) }, byStep);
      const result = await executeAction(action.actionKey, args, toolContext, "execute");
      byStep[action.id] = { data: result.data };
      results.push({ actionKey: action.actionKey, summary: result.summary, ok: true });
    } catch (error) {
      failed = true;
      const message = error instanceof Error ? error.message : String(error);
      results.push({ actionKey: action.actionKey, summary: `Fehlgeschlagen: ${message}`, ok: false, error: message });
      log.error("approval.action.failed", { tenantId, approvalId, actionKey: action.actionKey, error: message });
    }
  }

  const updated = await db.approvalRequest.update({
    where: { id: approval.id },
    data: {
      status: failed ? "FAILED" : "EXECUTED",
      decidedById: actor.userId,
      decidedAt: new Date(),
      decisionNote: options.note ?? null,
      executionResult: results as unknown as object,
    },
  });

  await writeAudit({
    tenantId,
    actorType: "USER",
    actorUserId: actor.userId,
    actorLabel: actor.label,
    action: "approval_approved",
    entityType: "approval",
    entityId: approval.id,
    result: failed ? "failed" : "success",
    approvalRequestId: approval.id,
    approvedByLabel: actor.label,
    details: { results },
    ip: actor.ip ?? null,
  });

  if (approval.sourceType === "email" && approval.sourceId) {
    await db.email.updateMany({
      where: { id: approval.sourceId },
      data: { status: failed ? "FAILED" : "PROCESSED", processingError: failed ? "Freigegebene Aktion fehlgeschlagen." : null },
    });
  }

  if (failed) {
    await notify({
      tenantId,
      type: "approval_failed",
      title: "Eine freigegebene Aktion konnte nicht ausgeführt werden.",
      body: results.find((entry) => entry.error)?.error ?? "",
      level: "URGENT",
      link: `/freigaben/${approval.id}`,
    });
  }

  return { approval: updated, results };
}

export async function reject(
  tenantId: string,
  approvalId: string,
  actor: DecisionActor,
  note?: string,
): Promise<ApprovalRequest> {
  const db = tenantDb(tenantId);
  const approval = await db.approvalRequest.findFirst({ where: { id: approvalId } });
  if (!approval) throw new NotFoundError("Freigabe nicht gefunden.");
  if (approval.status !== "PENDING") {
    throw new AppError("Diese Freigabe wurde bereits bearbeitet.", 409, "already_decided");
  }

  const updated = await db.approvalRequest.update({
    where: { id: approvalId },
    data: { status: "REJECTED", decidedById: actor.userId, decidedAt: new Date(), decisionNote: note ?? null },
  });

  if (approval.sourceType === "email" && approval.sourceId) {
    await db.email.updateMany({ where: { id: approval.sourceId }, data: { status: "HANDLED" } });
  }

  await writeAudit({
    tenantId,
    actorType: "USER",
    actorUserId: actor.userId,
    actorLabel: actor.label,
    action: "approval_rejected",
    entityType: "approval",
    entityId: approvalId,
    result: "rejected",
    approvalRequestId: approvalId,
    details: { note },
  });

  return updated;
}

export async function listPendingApprovals(tenantId: string, limit = 20) {
  return tenantDb(tenantId).approvalRequest.findMany({
    where: { status: "PENDING" },
    orderBy: [{ riskLevel: "desc" }, { createdAt: "asc" }],
    take: limit,
  });
}

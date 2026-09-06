import type { ActorType } from "@prisma/client";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";

const log = logger.child({ module: "audit" });

export interface AuditEntry {
  tenantId: string;
  actorType: ActorType;
  actorUserId?: string | null;
  actorLabel: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  result?: "success" | "failed" | "rejected";
  details?: Record<string, unknown>;
  aiExecutionId?: string | null;
  approvalRequestId?: string | null;
  approvedByLabel?: string | null;
  ip?: string | null;
}

/**
 * Audit-Protokoll (§19). Einträge werden nur angelegt, nie geändert oder gelöscht;
 * es gibt bewusst keine update/delete-Funktion in diesem Modul.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorType: entry.actorType,
        actorUserId: entry.actorUserId ?? null,
        actorLabel: entry.actorLabel,
        action: entry.action,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        result: entry.result ?? "success",
        details: (entry.details ?? {}) as object,
        aiExecutionId: entry.aiExecutionId ?? null,
        approvalRequestId: entry.approvalRequestId ?? null,
        approvedByLabel: entry.approvedByLabel ?? null,
        ip: entry.ip ?? null,
      },
    });
  } catch (error) {
    // Ein fehlgeschlagenes Protokoll darf die Aktion nicht verschlucken, muss aber sichtbar sein.
    log.error("audit.write.failed", {
      tenantId: entry.tenantId,
      action: entry.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

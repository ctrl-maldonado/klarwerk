import { randomUUID } from "node:crypto";
import type { JobStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "jobs" });

/**
 * Hintergrundverarbeitung (§28).
 * Die Warteschlange liegt in der Datenbank: wiederholbar, idempotent und
 * nachvollziehbar. Ein Redis-Backend kann denselben Vertrag später bedienen,
 * ohne dass Aufrufer angepasst werden müssen.
 */
export type JobHandler = (payload: Record<string, any>, job: { id: string; tenantId: string | null }) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerJob(key: string, handler: JobHandler): void {
  handlers.set(key, handler);
}

export interface EnqueueOptions {
  tenantId?: string | null;
  key: string;
  payload?: Record<string, unknown>;
  runAt?: Date;
  maxAttempts?: number;
  /** Verhindert Doppelverarbeitung desselben Ereignisses. */
  idempotencyKey?: string;
}

export async function enqueue(options: EnqueueOptions) {
  if (options.idempotencyKey) {
    const existing = await prisma.job.findUnique({ where: { idempotencyKey: options.idempotencyKey } });
    if (existing) return existing;
  }
  return prisma.job.create({
    data: {
      tenantId: options.tenantId ?? null,
      key: options.key,
      payload: (options.payload ?? {}) as object,
      runAt: options.runAt ?? new Date(),
      maxAttempts: options.maxAttempts ?? 5,
      idempotencyKey: options.idempotencyKey ?? null,
    },
  });
}

function backoffMinutes(attempts: number): number {
  return Math.min(2 ** attempts, 60);
}

/** Arbeitet bis zu `limit` fällige Aufträge ab. Gibt zurück, wie viele verarbeitet wurden. */
export async function runDueJobs(limit = 10, workerId = randomUUID()): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;

  for (let index = 0; index < limit; index += 1) {
    const candidate = await prisma.job.findFirst({
      where: { status: "PENDING", runAt: { lte: new Date() } },
      orderBy: { runAt: "asc" },
    });
    if (!candidate) break;

    // Optimistisches Sperren: nur wer den Status wechselt, führt aus.
    const claimed = await prisma.job.updateMany({
      where: { id: candidate.id, status: "PENDING" },
      data: { status: "RUNNING", lockedAt: new Date(), lockedBy: workerId, attempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue;

    const job = await prisma.job.findUniqueOrThrow({ where: { id: candidate.id } });
    const handler = handlers.get(job.key);

    if (!handler) {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: "DEAD", lastError: `Kein Handler für "${job.key}" registriert.`, finishedAt: new Date() },
      });
      failed += 1;
      log.error("job.no_handler", { jobId: job.id, key: job.key });
      continue;
    }

    try {
      await handler(job.payload as Record<string, any>, { id: job.id, tenantId: job.tenantId });
      await prisma.job.update({
        where: { id: job.id },
        data: { status: "COMPLETED", finishedAt: new Date(), lastError: null },
      });
      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const exhausted = job.attempts >= job.maxAttempts;
      const status: JobStatus = exhausted ? "DEAD" : "PENDING";
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status,
          lastError: message.slice(0, 1000),
          runAt: exhausted ? job.runAt : new Date(Date.now() + backoffMinutes(job.attempts) * 60_000),
          lockedAt: null,
          lockedBy: null,
          ...(exhausted ? { finishedAt: new Date() } : {}),
        },
      });
      failed += 1;
      log.error("job.failed", { jobId: job.id, key: job.key, attempts: job.attempts, exhausted, error: message });
    }
  }

  return { processed, failed };
}

export function listRegisteredJobs(): string[] {
  return [...handlers.keys()];
}

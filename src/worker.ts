/**
 * Hintergrundprozess (§28, §45).
 * Startet mit `npm run worker` neben der Anwendung.
 *
 * - ruft verbundene Postfächer regelmäßig ab und stößt die Automationen an
 * - setzt Aufbewahrungsfristen durch
 * - arbeitet die Warteschlange mit Wiederholung und Backoff ab
 */
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { enqueue, runDueJobs } from "@/modules/jobs/queue";
import "@/modules/jobs/handlers";

const log = logger.child({ module: "worker" });

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_MS ?? 5000);
const MAILBOX_INTERVAL_MS = Number(process.env.WORKER_MAILBOX_MS ?? 5 * 60_000);
const RETENTION_INTERVAL_MS = 24 * 60 * 60_000;

let running = true;

async function scheduleMailboxSyncs() {
  const integrations = await prisma.integration.findMany({
    where: { type: "EMAIL", status: { in: ["CONNECTED", "EXPIRED"] }, providerKey: { not: "demo" } },
    select: { tenantId: true },
  });

  const slot = Math.floor(Date.now() / MAILBOX_INTERVAL_MS);
  for (const integration of integrations) {
    await enqueue({
      tenantId: integration.tenantId,
      key: "email.sync",
      payload: { tenantId: integration.tenantId },
      idempotencyKey: `email.sync:${integration.tenantId}:${slot}`,
    });
  }
}

async function scheduleRetention() {
  const day = new Date().toISOString().slice(0, 10);
  await enqueue({ key: "privacy.retention", idempotencyKey: `privacy.retention:${day}` });
}

async function main() {
  log.info("worker.started", { pollIntervalMs: POLL_INTERVAL_MS });

  let lastMailboxCheck = 0;
  let lastRetentionCheck = 0;

  while (running) {
    try {
      const now = Date.now();
      if (now - lastMailboxCheck > MAILBOX_INTERVAL_MS) {
        lastMailboxCheck = now;
        await scheduleMailboxSyncs();
      }
      if (now - lastRetentionCheck > RETENTION_INTERVAL_MS) {
        lastRetentionCheck = now;
        await scheduleRetention();
      }

      const result = await runDueJobs(10);
      if (result.processed || result.failed) log.info("worker.tick", result);
    } catch (error) {
      log.error("worker.tick.failed", { error: error instanceof Error ? error.message : String(error) });
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  await prisma.$disconnect();
  log.info("worker.stopped");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log.info("worker.stopping", { signal });
    running = false;
  });
}

main().catch((error) => {
  log.error("worker.crashed", { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});

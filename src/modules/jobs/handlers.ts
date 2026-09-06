import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { syncInbox } from "@/modules/email/service";
import { runWorkflowsForEmail } from "@/modules/workflows/engine";
import { applyRetention } from "@/modules/privacy/service";
import { dispatchWebhook } from "@/modules/webhooks";
import { registerJob } from "./queue";

const log = logger.child({ module: "jobs.handlers" });

/** E-Mails eines Mandanten abrufen und für jede neue Nachricht die Automationen anstoßen. */
registerJob("email.sync", async (payload) => {
  const tenantId = String(payload.tenantId);
  const before = await prisma.email.findMany({
    where: { tenantId, status: "RECEIVED" },
    select: { id: true },
  });
  const known = new Set(before.map((entry) => entry.id));

  const result = await syncInbox(tenantId);
  log.info("email.sync.done", { tenantId, ...result });

  const fresh = await prisma.email.findMany({
    where: { tenantId, status: "RECEIVED", direction: "INBOUND" },
    select: { id: true },
  });
  for (const email of fresh) {
    if (known.has(email.id)) continue;
    await dispatchWebhook(tenantId, "email.received", { emailId: email.id });
    await runWorkflowsForEmail(tenantId, email.id).catch((error) => {
      log.error("email.workflow.failed", { tenantId, emailId: email.id, error: (error as Error).message });
    });
  }
});

/** Eine einzelne Nachricht verarbeiten (z. B. nach Eingang über die Intake-Schnittstelle). */
registerJob("email.process", async (payload) => {
  await runWorkflowsForEmail(String(payload.tenantId), String(payload.emailId));
});

/** Aufbewahrungsfristen für alle Mandanten durchsetzen. */
registerJob("privacy.retention", async () => {
  const tenants = await prisma.tenant.findMany({ where: { deletedAt: null }, select: { id: true } });
  for (const tenant of tenants) {
    const result = await applyRetention(tenant.id);
    if (result.emailsDeleted) log.info("retention.applied", { tenantId: tenant.id, ...result });
  }
});

export {};

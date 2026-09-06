import { createHmac } from "node:crypto";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";

const log = logger.child({ module: "webhooks" });

export const WEBHOOK_EVENTS = [
  "email.received",
  "order.created",
  "appointment.changed",
  "customer.created",
  "ai.action.completed",
  "error.occurred",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Stellt ein Ereignis allen passenden Endpunkten zu (§26). Fehler werden protokolliert, nicht verschluckt. */
export async function dispatchWebhook(tenantId: string, event: WebhookEvent, payload: Record<string, unknown>) {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { tenantId, isActive: true, events: { has: event } },
  });

  for (const endpoint of endpoints) {
    const body = JSON.stringify({ event, tenantId, at: new Date().toISOString(), data: payload });
    const signature = createHmac("sha256", endpoint.secret).update(body).digest("hex");

    const delivery = await prisma.webhookDelivery.create({
      data: { tenantId, endpointId: endpoint.id, event, payload: payload as object },
    });

    try {
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Klarwerk-Event": event,
          "X-Klarwerk-Signature": `sha256=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          attempts: 1,
          responseStatus: response.status,
          deliveredAt: response.ok ? new Date() : null,
          error: response.ok ? null : `HTTP ${response.status}`,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { attempts: 1, error: message.slice(0, 500) },
      });
      log.warn("webhook.delivery.failed", { tenantId, endpointId: endpoint.id, event, error: message });
    }
  }
}

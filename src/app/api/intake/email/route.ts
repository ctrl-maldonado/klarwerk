import { NextResponse } from "next/server";
import { z } from "zod";
import { tenantDb } from "@/lib/tenant-db";
import { recordUsage } from "@/modules/billing/usage";
import { enqueue } from "@/modules/jobs/queue";
import { apiError, authenticateRequest, requireScope } from "@/modules/api/auth";
import { dispatchWebhook } from "@/modules/webhooks";

const schema = z.object({
  fromEmail: z.string().email(),
  fromName: z.string().optional(),
  to: z.array(z.string()).optional(),
  subject: z.string().optional(),
  body: z.string().min(1),
  receivedAt: z.string().datetime().optional(),
  externalId: z.string().optional(),
  attachments: z
    .array(z.object({ filename: z.string(), mimeType: z.string(), size: z.number().int().nonnegative() }))
    .optional(),
});

/**
 * Eingangsschnittstelle für Nachrichten aus fremden Systemen
 * (Kontaktformular, Telefonanlage, andere Mailsysteme).
 * Die Verarbeitung läuft asynchron über die Warteschlange.
 */
export async function POST(request: Request) {
  try {
    const caller = await authenticateRequest(request);
    requireScope(caller, "emails:write");

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "invalid_payload", message: parsed.error.issues[0].message } },
        { status: 400 },
      );
    }

    const db = tenantDb(caller.tenantId);
    const externalId = parsed.data.externalId ?? `intake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const existing = await db.email.findFirst({ where: { externalId } });
    if (existing) {
      return NextResponse.json({ id: existing.id, status: "already_received" }, { status: 200 });
    }

    const email = await db.email.create({
      data: {
        tenantId: caller.tenantId,
        externalId,
        direction: "INBOUND",
        status: "RECEIVED",
        fromName: parsed.data.fromName ?? "",
        fromEmail: parsed.data.fromEmail,
        toEmails: parsed.data.to ?? [],
        ccEmails: [],
        subject: parsed.data.subject ?? "",
        bodyText: parsed.data.body,
        receivedAt: parsed.data.receivedAt ? new Date(parsed.data.receivedAt) : new Date(),
        attachments: parsed.data.attachments?.length
          ? {
              create: parsed.data.attachments.map((attachment) => ({
                tenantId: caller.tenantId,
                filename: attachment.filename,
                mimeType: attachment.mimeType,
                size: attachment.size,
              })),
            }
          : undefined,
      },
    });

    await recordUsage(caller.tenantId, "emails_processed", 1, { emailId: email.id, source: "intake" });
    await enqueue({
      tenantId: caller.tenantId,
      key: "email.process",
      payload: { tenantId: caller.tenantId, emailId: email.id },
      idempotencyKey: `email.process:${email.id}`,
    });
    await dispatchWebhook(caller.tenantId, "email.received", { emailId: email.id });

    return NextResponse.json({ id: email.id, status: "queued" }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}

import type { Email, Integration } from "@prisma/client";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { AppError, NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { tenantDb } from "@/lib/tenant-db";
import { recordUsage } from "@/modules/billing/usage";
import { DemoMailboxProvider } from "./providers/demo-mailbox";
import { GmailProvider, refreshGoogleToken } from "./providers/google";
import { MicrosoftGraphProvider, refreshMicrosoftToken } from "./providers/microsoft";
import type { EmailProvider, OAuthTokens } from "./providers/types";

const log = logger.child({ module: "email" });

/** Lädt den verbundenen E-Mail-Provider eines Mandanten – oder null. */
export async function getEmailProvider(
  tenantId: string,
): Promise<{ provider: EmailProvider; integration: Integration } | null> {
  const db = tenantDb(tenantId);
  const integration = await db.integration.findFirst({
    where: { type: "EMAIL", status: { in: ["CONNECTED", "EXPIRED"] } },
    orderBy: { updatedAt: "desc" },
  });
  if (!integration) return null;

  if (integration.providerKey === "demo") {
    return { provider: new DemoMailboxProvider(), integration };
  }

  if (!integration.encryptedCredentials) {
    throw new AppError(
      `Die Verbindung zu ${integration.providerKey} ist unvollständig. Bitte das Postfach erneut verbinden.`,
      502,
      "integration_error",
    );
  }

  let tokens = JSON.parse(decryptSecret(integration.encryptedCredentials)) as OAuthTokens;

  if (tokens.expiresAt < Date.now() + 60_000 && tokens.refreshToken) {
    const refreshed =
      integration.providerKey === "microsoft365"
        ? await refreshMicrosoftToken(tokens.refreshToken)
        : await refreshGoogleToken(tokens.refreshToken);
    tokens = { ...refreshed, refreshToken: refreshed.refreshToken ?? tokens.refreshToken };
    await db.integration.update({
      where: { id: integration.id },
      data: { encryptedCredentials: encryptSecret(JSON.stringify(tokens)), status: "CONNECTED", lastError: null },
    });
  }

  const provider =
    integration.providerKey === "microsoft365"
      ? new MicrosoftGraphProvider(tokens.accessToken)
      : new GmailProvider(tokens.accessToken);

  return { provider, integration };
}

/** Holt neue Nachrichten und legt sie an. Bereits bekannte werden übersprungen (idempotent). */
export async function syncInbox(tenantId: string, limit = 25): Promise<{ imported: number; skipped: number }> {
  const db = tenantDb(tenantId);
  const connection = await getEmailProvider(tenantId);
  if (!connection) {
    throw new AppError("Es ist kein Postfach verbunden. Bitte unter Einstellungen › Integrationen verbinden.", 400, "no_mailbox");
  }

  const since = connection.integration.lastSyncAt ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  let imported = 0;
  let skipped = 0;

  try {
    const messages = await connection.provider.listMessages({ since, limit });
    for (const message of messages) {
      const existing = await db.email.findFirst({ where: { externalId: message.externalId } });
      if (existing) {
        skipped += 1;
        continue;
      }
      const created = await db.email.create({
        data: {
          tenantId,
          integrationId: connection.integration.id,
          externalId: message.externalId,
          threadId: message.threadId ?? null,
          direction: "INBOUND",
          status: "RECEIVED",
          fromName: message.fromName,
          fromEmail: message.fromEmail,
          toEmails: message.to,
          ccEmails: message.cc,
          subject: message.subject,
          bodyText: message.bodyText,
          bodyHtml: message.bodyHtml ?? null,
          receivedAt: message.receivedAt,
          attachments: {
            create: message.attachments.map((attachment) => ({
              tenantId,
              filename: attachment.filename,
              mimeType: attachment.mimeType,
              size: attachment.size,
            })),
          },
        },
      });
      imported += 1;
      await recordUsage(tenantId, "emails_processed", 1, { emailId: created.id });
    }

    await db.integration.update({
      where: { id: connection.integration.id },
      data: { lastSyncAt: new Date(), status: "CONNECTED", lastError: null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.integration.update({
      where: { id: connection.integration.id },
      data: { status: "ERROR", lastError: message.slice(0, 500) },
    });
    log.error("email.sync.failed", { tenantId, error: message });
    throw error;
  }

  return { imported, skipped };
}

/**
 * Versendet einen gespeicherten Entwurf.
 * Ohne verbundenes Postfach schlägt der Versand ausdrücklich fehl – es wird
 * niemals ein Versand vorgetäuscht (§42).
 */
export async function sendDraft(tenantId: string, emailId: string): Promise<Email> {
  const db = tenantDb(tenantId);
  const draft = await db.email.findFirst({ where: { id: emailId } });
  if (!draft) throw new NotFoundError("Der Entwurf wurde nicht gefunden.");
  if (draft.direction !== "OUTBOUND") throw new AppError("Nur ausgehende Entwürfe können versendet werden.");
  if (draft.status === "SENT") return draft;

  const connection = await getEmailProvider(tenantId);
  if (!connection) {
    throw new AppError(
      "E-Mail konnte nicht versendet werden: Es ist kein Postfach verbunden.",
      400,
      "no_mailbox",
    );
  }

  const result = await connection.provider.sendMessage({
    to: draft.toEmails,
    cc: draft.ccEmails,
    subject: draft.subject,
    bodyText: draft.bodyText,
  });

  const updated = await db.email.update({
    where: { id: draft.id },
    data: {
      status: "SENT",
      sentAt: new Date(),
      externalId: result.externalId ?? draft.externalId,
      processingError: result.deliveredExternally ? null : (result.note ?? "Nicht an einen Mailserver übergeben."),
    },
  });

  await recordUsage(tenantId, "emails_sent", 1, { emailId: draft.id, deliveredExternally: result.deliveredExternally });
  return updated;
}

export const EMAIL_STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Posteingang",
  PROCESSING: "In Verarbeitung",
  NEEDS_APPROVAL: "Wartet auf Freigabe",
  PROCESSED: "Automatisch verarbeitet",
  HANDLED: "Bearbeitet",
  FAILED: "Fehler",
  DRAFT: "Entwurf",
  SENT: "Gesendet",
};

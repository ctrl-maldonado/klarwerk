"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthApi } from "@/modules/auth/context";
import { tenantDb } from "@/lib/tenant-db";
import { syncInbox } from "@/modules/email/service";
import { runWorkflowsForEmail } from "@/modules/workflows/engine";
import { recordUsage } from "@/modules/billing/usage";
import { writeAudit } from "@/modules/audit";

export interface EmailActionState {
  error?: string;
  success?: string;
}

export async function syncInboxAction(_prev: EmailActionState, _formData: FormData): Promise<EmailActionState> {
  try {
    const context = await requireAuthApi();
    context.assert("emails:read");
    const result = await syncInbox(context.tenant.id);
    revalidatePath("/emails");
    return { success: `${result.imported} neue Nachrichten abgerufen (${result.skipped} bereits bekannt).` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Abruf fehlgeschlagen." };
  }
}

export async function processEmailAction(_prev: EmailActionState, formData: FormData): Promise<EmailActionState> {
  try {
    const context = await requireAuthApi();
    context.assert("ai:use");
    const emailId = String(formData.get("emailId"));
    await runWorkflowsForEmail(context.tenant.id, emailId);
    revalidatePath(`/emails/${emailId}`);
    revalidatePath("/emails");
    revalidatePath("/freigaben");
    return { success: "Klarwerk hat die Nachricht verarbeitet." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Verarbeitung fehlgeschlagen." };
  }
}

export async function markHandledAction(formData: FormData): Promise<void> {
  const context = await requireAuthApi();
  context.assert("emails:write");
  const emailId = String(formData.get("emailId"));
  await tenantDb(context.tenant.id).email.updateMany({ where: { id: emailId }, data: { status: "HANDLED", isRead: true } });
  await writeAudit({
    tenantId: context.tenant.id,
    actorType: "USER",
    actorUserId: context.user.id,
    actorLabel: context.user.name,
    action: "email_marked_handled",
    entityType: "email",
    entityId: emailId,
  });
  revalidatePath("/emails");
  revalidatePath(`/emails/${emailId}`);
}

/**
 * Legt eine eingehende Nachricht von Hand an – für Vorführungen und für
 * Anfragen, die telefonisch oder über ein Formular hereinkommen.
 * Es wird nichts vorgetäuscht: die Nachricht ist eine echte, gespeicherte E-Mail.
 */
export async function simulateInboundAction(_prev: EmailActionState, formData: FormData): Promise<EmailActionState> {
  try {
    const context = await requireAuthApi();
    context.assert("emails:write");
    const db = tenantDb(context.tenant.id);

    const fromEmail = String(formData.get("fromEmail") ?? "").trim();
    const fromName = String(formData.get("fromName") ?? "").trim();
    const subject = String(formData.get("subject") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();
    if (!fromEmail || !body) return { error: "Absender und Nachrichtentext werden benötigt." };

    const email = await db.email.create({
      data: {
        tenantId: context.tenant.id,
        externalId: `manual-${Date.now()}`,
        direction: "INBOUND",
        status: "RECEIVED",
        fromName,
        fromEmail,
        toEmails: [context.tenant.email ?? context.user.email],
        ccEmails: [],
        subject,
        bodyText: body,
        receivedAt: new Date(),
      },
    });
    await recordUsage(context.tenant.id, "emails_processed", 1, { emailId: email.id, source: "manual" });
    await runWorkflowsForEmail(context.tenant.id, email.id);

    revalidatePath("/emails");
    revalidatePath("/freigaben");
    redirect(`/emails/${email.id}`);
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    return { error: error instanceof Error ? error.message : "Anlegen fehlgeschlagen." };
  }
}

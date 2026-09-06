import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboarded } from "@/modules/auth/context";
import { tenantDb } from "@/lib/tenant-db";
import { toApprovalView } from "@/modules/approvals/view";
import { ApprovalCard } from "@/components/app/approval-card";
import { Alert, Badge, Card, CardBody, CardHeader, ConfidenceBar, PageHeader, StatusTag } from "@/components/ui";
import { EMAIL_STATUS_LABELS } from "@/modules/email/service";
import { customerDisplayName } from "@/modules/customers/service";
import { PRIORITY_LABELS } from "@/modules/orders/service";
import { formatDateTime } from "@/lib/utils";
import { EmailActions } from "./email-actions";

export const metadata: Metadata = { title: "Nachricht" };


export default async function EmailDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireOnboarded();
  context.assert("emails:read");
  const { id } = await params;
  const db = tenantDb(context.tenant.id);

  const email = await db.email.findFirst({
    where: { id },
    include: { customer: true, order: true, attachments: true },
  });
  if (!email) notFound();

  if (!email.isRead) {
    await db.email.updateMany({ where: { id: email.id }, data: { isRead: true } });
  }

  const [approval, category, executions] = await Promise.all([
    db.approvalRequest.findFirst({ where: { sourceType: "email", sourceId: email.id }, orderBy: { createdAt: "desc" } }),
    email.categoryKey ? db.emailCategory.findFirst({ where: { key: email.categoryKey } }) : null,
    db.aIExecution.findMany({ where: { entityType: "email", entityId: email.id }, orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        title={email.subject || "(kein Betreff)"}
        description={`${email.direction === "INBOUND" ? "Von" : "An"} ${
          email.direction === "INBOUND" ? `${email.fromName || ""} <${email.fromEmail}>` : email.toEmails.join(", ")
        } · ${formatDateTime(email.receivedAt)}`}
        action={
          <EmailActions
            emailId={email.id}
            canProcess={context.can("ai:use") && email.direction === "INBOUND"}
            canWrite={context.can("emails:write")}
            alreadyProcessed={email.status === "PROCESSED" || email.status === "HANDLED"}
          />
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={email.status === "FAILED" ? "danger" : email.status === "NEEDS_APPROVAL" ? "warning" : "neutral"}>
          {EMAIL_STATUS_LABELS[email.status]}
        </Badge>
        {category ? (
          <StatusTag label={category.label} color={category.color} />
        ) : null}
        {email.priority ? <Badge tone={email.priority === "URGENT" ? "danger" : "info"}>{PRIORITY_LABELS[email.priority]}</Badge> : null}
        {email.customer ? (
          <Link href={`/kunden/${email.customer.id}`} className="text-sm font-medium text-brand-700 hover:underline">
            {customerDisplayName(email.customer)}
          </Link>
        ) : null}
        {email.order ? (
          <Link href={`/auftraege/${email.order.id}`} className="text-sm font-medium text-brand-700 hover:underline">
            Auftrag {email.order.orderNumber}
          </Link>
        ) : null}
      </div>

      {email.processingError ? (
        <div className="mb-4">
          <Alert tone="danger" title="Verarbeitung nicht abgeschlossen">
            {email.processingError}
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Nachricht" />
            <CardBody>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-700">{email.bodyText}</p>
              {email.attachments.length ? (
                <ul className="mt-4 space-y-1 border-t border-ink-100 pt-3 text-sm text-ink-600">
                  {email.attachments.map((attachment) => (
                    <li key={attachment.id}>
                      📎 {attachment.filename} <span className="text-xs text-ink-500">({attachment.mimeType})</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardBody>
          </Card>

          {approval && (approval.status === "PENDING" || approval.status === "FAILED") ? (
            <ApprovalCard approval={toApprovalView(approval)} />
          ) : approval ? (
            <Alert tone="success">
              Der Vorschlag zu dieser Nachricht wurde bereits entschieden.{" "}
              <Link href={`/freigaben/${approval.id}`} className="font-medium underline">
                Details ansehen
              </Link>
            </Alert>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Was Klarwerk erkannt hat" />
            <CardBody className="space-y-3 text-sm">
              {email.aiSummary ? <p className="text-ink-700">{email.aiSummary}</p> : null}
              {typeof email.categoryConfidence === "number" ? (
                <div>
                  <p className="text-xs font-medium text-ink-500">Einordnung</p>
                  <div className="mt-1">
                    <ConfidenceBar value={email.categoryConfidence} label="Vertrauen" />
                  </div>
                </div>
              ) : null}
              {!email.aiSummary && !email.categoryConfidence ? (
                <p className="text-ink-500">Diese Nachricht wurde noch nicht verarbeitet.</p>
              ) : null}
            </CardBody>
          </Card>

          {executions.length ? (
            <Card>
              <CardHeader title="Verarbeitungsschritte" />
              <CardBody className="space-y-2 text-sm">
                {executions.map((execution) => (
                  <div key={execution.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-ink-700">{execution.taskKey}</p>
                      <p className="text-xs text-ink-500">
                        {formatDateTime(execution.createdAt)} · {execution.model}
                        {execution.isDemo ? " · Demo" : ""}
                      </p>
                    </div>
                    <Badge tone={execution.status === "FAILED" ? "danger" : "success"}>
                      {execution.status === "FAILED" ? "Fehler" : "ok"}
                    </Badge>
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : null}
        </aside>
      </div>
    </>
  );
}

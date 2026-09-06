import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/modules/auth/context";
import { tenantDb } from "@/lib/tenant-db";
import { EMAIL_STATUS_LABELS } from "@/modules/email/service";
import { Badge, Card, CardBody, EmptyState, PageHeader, StatusTag } from "@/components/ui";
import { formatRelative, truncate } from "@/lib/utils";
import { InboxToolbar } from "./inbox-toolbar";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "E-Mails" };


const FOLDERS = [
  { key: "inbox", label: "Posteingang", statuses: ["RECEIVED", "PROCESSING"] },
  { key: "approval", label: "Wartet auf Freigabe", statuses: ["NEEDS_APPROVAL"] },
  { key: "processed", label: "Automatisch verarbeitet", statuses: ["PROCESSED"] },
  { key: "handled", label: "Bearbeitet", statuses: ["HANDLED"] },
  { key: "failed", label: "Fehler", statuses: ["FAILED"] },
  { key: "sent", label: "Gesendet", statuses: ["SENT", "DRAFT"] },
] as const;

export default async function EmailsPage({ searchParams }: { searchParams: Promise<{ ordner?: string }> }) {
  const context = await requireOnboarded();
  context.assert("emails:read");
  const db = tenantDb(context.tenant.id);

  const params = await searchParams;
  const folder = FOLDERS.find((entry) => entry.key === params.ordner) ?? FOLDERS[0];

  const [emails, counts, categories, integration] = await Promise.all([
    db.email.findMany({
      where: { status: { in: folder.statuses as unknown as string[] as never } },
      include: { customer: true },
      orderBy: { receivedAt: "desc" },
      take: 50,
    }),
    db.email.groupBy({ by: ["status"], _count: { _all: true } }),
    db.emailCategory.findMany(),
    db.integration.findFirst({ where: { type: "EMAIL" } }),
  ]);

  const countByStatus = Object.fromEntries(counts.map((row) => [row.status, row._count._all]));
  const categoryByKey = Object.fromEntries(categories.map((category) => [category.key, category]));

  return (
    <>
      <PageHeader
        title="E-Mails"
        description={
          integration
            ? `Verbunden: ${integration.displayName || integration.providerKey}${integration.status !== "CONNECTED" ? ` – ${integration.status}` : ""}`
            : "Kein Postfach verbunden. Nachrichten können manuell erfasst werden."
        }
        action={<InboxToolbar canWrite={context.can("emails:write")} hasMailbox={Boolean(integration)} />}
      />

      <div className="mb-4 flex flex-wrap gap-1">
        {FOLDERS.map((entry) => {
          const count = entry.statuses.reduce((total, status) => total + (countByStatus[status] ?? 0), 0);
          const active = entry.key === folder.key;
          return (
            <Link
              key={entry.key}
              href={`/emails?ordner=${entry.key}`}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm transition",
                active ? "bg-ink-900 text-white" : "bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50",
              )}
            >
              {entry.label}
              {count ? <span className="ml-1.5 tabular-nums opacity-70">{count}</span> : null}
            </Link>
          );
        })}
      </div>

      <Card>
        {emails.length ? (
          <CardBody className="divide-y divide-ink-100 px-0 py-0">
            {emails.map((email) => {
              const category = email.categoryKey ? categoryByKey[email.categoryKey] : null;
              return (
                <Link key={email.id} href={`/emails/${email.id}`} className="block px-5 py-3.5 transition hover:bg-ink-50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink-900">
                        {email.direction === "OUTBOUND" ? `An ${email.toEmails.join(", ")}` : email.fromName || email.fromEmail}
                      </span>
                      {email.customer ? <Badge tone="brand">Bestandskunde</Badge> : null}
                      {category ? (
                        <StatusTag label={category.label} color={category.color} />
                      ) : null}
                      {email.priority === "URGENT" ? <Badge tone="danger">dringend</Badge> : null}
                      {email.status === "FAILED" ? <Badge tone="danger">Fehler</Badge> : null}
                    </div>
                    <span className="shrink-0 text-xs text-ink-500">{formatRelative(email.receivedAt)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-ink-700">{email.subject || "(kein Betreff)"}</p>
                  <p className="mt-0.5 text-sm text-ink-500">{truncate(email.aiSummary || email.bodyText.replace(/\s+/g, " "), 130)}</p>
                  {email.status !== "RECEIVED" ? (
                    <p className="mt-1 text-xs text-ink-500">{EMAIL_STATUS_LABELS[email.status]}</p>
                  ) : null}
                </Link>
              );
            })}
          </CardBody>
        ) : (
          <EmptyState title="Keine Nachrichten in diesem Ordner" />
        )}
      </Card>
    </>
  );
}

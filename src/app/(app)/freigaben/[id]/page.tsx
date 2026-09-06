import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboarded } from "@/modules/auth/context";
import { tenantDb } from "@/lib/tenant-db";
import { toApprovalView } from "@/modules/approvals/view";
import { ApprovalCard, SourceMessage } from "@/components/app/approval-card";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Freigabe" };

const OUTCOME_LABELS: Record<string, string> = {
  EXECUTED: "Freigegeben und ausgeführt",
  APPROVED: "Freigegeben",
  REJECTED: "Abgelehnt",
  EXPIRED: "Abgelaufen, weil zu lange offen",
};

export default async function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireOnboarded();
  const { id } = await params;
  const db = tenantDb(context.tenant.id);

  const approval = await db.approvalRequest.findFirst({
    where: { id },
    include: { decidedBy: true },
  });
  if (!approval) notFound();

  /* Die Nachricht gehört auch nach der Entscheidung dazu: hier wird
     nachvollzogen, worauf entschieden wurde. */
  const source =
    approval.sourceType === "email" && approval.sourceId
      ? await db.email.findFirst({ where: { id: approval.sourceId }, include: { attachments: true } })
      : null;

  const view = toApprovalView(approval, source);
  const results = (approval.executionResult as Array<{ summary: string; ok: boolean }> | null) ?? [];
  const open = approval.status === "PENDING" || approval.status === "FAILED";

  return (
    <>
      <PageHeader
        title={approval.title}
        /* Ohne Beschreibung: die Karte trägt Zeitpunkt und Schrittzahl schon,
           und die Zeile fehlt sonst unten bei der Entscheidung. */
        action={
          <Link href="/freigaben" className="text-sm font-medium text-brand-700 hover:underline">
            Alle Freigaben
          </Link>
        }
      />

      {open ? (
        /* Nach der Entscheidung zurück in die Liste: hier bliebe sonst eine
           Karte stehen, an der es nichts mehr zu entscheiden gibt. Der
           Antwortentwurf startet eingeklappt – gelesen wird häufiger als
           bearbeitet, und die Schaltfläche dafür steht direkt daneben. */
        <ApprovalCard approval={view} redirectTo="/freigaben" showTitle={false} />
      ) : (
        <div className="space-y-4">
          <Alert tone={approval.status === "EXECUTED" ? "success" : "info"} title={OUTCOME_LABELS[approval.status] ?? approval.status}>
            {approval.decidedBy ? `Entschieden von ${approval.decidedBy.name}` : "Entschieden"}
            {approval.decidedAt ? ` am ${formatDateTime(approval.decidedAt)}` : ""}.
            {approval.decisionNote ? ` Notiz: ${approval.decisionNote}` : ""}
          </Alert>

          <Card className="overflow-hidden">
            <div className={view.source ? "grid lg:grid-cols-2 lg:divide-x lg:divide-ink-200" : "grid"}>
              {view.source ? <SourceMessage source={view.source} /> : null}

              <div className={view.source ? "border-t border-ink-200 lg:border-t-0" : undefined}>
                <section className="px-5 py-4">
                  <h4 className="mb-2 text-xs font-semibold text-ink-500">Das hatte Klarwerk verstanden</h4>
                  {view.facts.length ? (
                    <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
                      {view.facts.map((fact) => (
                        <div key={fact.label} className="contents">
                          <dt className="text-ink-500">{fact.label}</dt>
                          <dd className="min-w-0 text-ink-800">{fact.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="max-w-[65ch] whitespace-pre-line text-sm text-ink-700">{approval.summary}</p>
                  )}
                </section>

                <section className="border-t border-ink-200 px-5 py-4">
                  <h4 className="mb-2 text-xs font-semibold text-ink-500">
                    {results.length ? "Was ausgeführt wurde" : "Was vorbereitet war"}
                  </h4>
                  {results.length ? (
                    <ul className="space-y-1.5">
                      {results.map((result, index) => (
                        <li key={index} className="flex items-start justify-between gap-3 text-sm">
                          <span className="min-w-0 text-ink-700">{result.summary}</span>
                          <Badge tone={result.ok ? "success" : "danger"}>{result.ok ? "erledigt" : "Fehler"}</Badge>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="space-y-1.5 text-sm text-ink-500">
                      {view.actions.map((action) => (
                        <li key={action.id}>{action.label}</li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

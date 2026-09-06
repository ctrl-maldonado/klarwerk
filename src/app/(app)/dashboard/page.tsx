import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/modules/auth/context";
import { tenantDb } from "@/lib/tenant-db";
import { getDashboardSummary, getAnalytics } from "@/modules/analytics/service";
import { listPendingApprovals } from "@/modules/approvals";
import { toApprovalView } from "@/modules/approvals/view";
import { getAIStatus } from "@/modules/ai/service";
import { PendingApprovals } from "@/components/app/pending-approvals";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, LinkButton, StatCard } from "@/components/ui";
import { formatHours, formatRelative, formatTime, formatWeekday } from "@/lib/utils";
import { PRIORITY_LABELS } from "@/modules/orders/service";

export const metadata: Metadata = { title: "Übersicht" };


export default async function DashboardPage() {
  const context = await requireOnboarded();
  const db = tenantDb(context.tenant.id);

  const [summary, approvals, aiStatus, analytics, recentExecutions, todaysAppointments] = await Promise.all([
    getDashboardSummary(context.tenant.id),
    listPendingApprovals(context.tenant.id, 8),
    getAIStatus(context.tenant.id),
    getAnalytics(context.tenant.id, 7),
    db.aIExecution.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    db.appointment.findMany({
      where: {
        start: { gte: new Date(new Date().setHours(0, 0, 0, 0)), lt: new Date(new Date().setHours(24, 0, 0, 0)) },
        status: { in: ["PROPOSED", "CONFIRMED"] },
      },
      include: { employee: true, customer: true },
      orderBy: { start: "asc" },
      take: 6,
    }),
  ]);

  const taskLabels: Record<string, string> = {
    email_classify: "E-Mail eingeordnet",
    request_extract: "Angaben aus Anfrage gelesen",
    customer_match: "Kunde zugeordnet",
    reply_draft: "Antwortentwurf erstellt",
    appointment_reason: "Termin ausgewählt",
    document_extract: "Dokument ausgewertet",
    assistant_chat: "Frage beantwortet",
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-ink-200 pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">{formatWeekday(new Date())}</h1>
          <p className="mt-1 text-sm text-ink-600">
            {summary.openApprovals > 0
              ? `${summary.openApprovals} ${summary.openApprovals === 1 ? "Vorschlag wartet" : "Vorschläge warten"} auf Ihre Freigabe.`
              : "Nichts wartet auf Ihre Freigabe."}
          </p>
        </div>
        {summary.openApprovals > 0 ? (
          <LinkButton href="/freigaben" variant="primary">
            Freigaben prüfen
          </LinkButton>
        ) : null}
      </div>

      {aiStatus.isDemo ? (
        <div className="mb-6">
          <Alert tone="warning" title="Demo-Modus – kein KI-Modell verbunden">
            {aiStatus.message}{" "}
            <Link href="/einstellungen/ai" className="font-medium underline">
              Jetzt einrichten
            </Link>
          </Alert>
        </div>
      ) : null}

      <section className="mb-6">
        {/* Eine zusammenhängende Leiste statt sechs Einzelkarten: die Zahlen
            gehören zusammen und werden im Vergleich gelesen. */}
        <div className="grid grid-cols-2 gap-px border border-ink-200 bg-ink-200 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Neue Anfragen" value={summary.newEmails} href="/emails" />
          <StatCard label="Offene Angebote" value={summary.openQuotes} href="/auftraege?status=quote_required" />
          <StatCard label="Termine heute" value={summary.todaysAppointments} href="/kalender" />
          <StatCard label="Dringende Fälle" value={summary.urgentOrders} tone="danger" href="/auftraege?priority=URGENT" />
          <StatCard label="Freigaben" value={summary.openApprovals} tone="warning" href="/freigaben" />
          <StatCard label="Offene Aufgaben" value={summary.openTasks} href="/auftraege" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-900">
              Wartet auf Ihre Freigabe
              {approvals.length ? <span className="ml-1.5 text-ink-500">({summary.openApprovals})</span> : null}
            </h2>
            {approvals.length ? (
              <Link href="/freigaben" className="text-sm font-medium text-brand-700 hover:underline">
                Alle Freigaben ansehen
              </Link>
            ) : null}
          </div>

          {approvals.length ? (
            <Card>
              <PendingApprovals approvals={approvals.map((approval) => toApprovalView(approval))} />
            </Card>
          ) : (
            <Card>
              <EmptyState
                title="Nichts zu tun"
                description="Sobald eine neue Anfrage eingeht, bereitet Klarwerk alles vor und fragt hier nach Ihrer Freigabe."
                action={<LinkButton href="/emails">Zum Posteingang</LinkButton>}
              />
            </Card>
          )}
        </section>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Was Klarwerk gemacht hat" description="Die letzten Schritte des Assistenten." />
            <CardBody className="space-y-3">
              {recentExecutions.length ? (
                recentExecutions.map((execution) => (
                  <div key={execution.id} className="flex items-baseline gap-3">
                    <span data-numeric className="w-20 shrink-0 text-xs text-ink-500">
                      {formatRelative(execution.createdAt)}
                    </span>
                    <div className="min-w-0">
                      <p className={execution.status === "FAILED" ? "text-sm text-red-700" : "text-sm text-ink-800"}>
                        {taskLabels[execution.taskKey] ?? execution.taskKey}
                        {execution.status === "FAILED" ? " – fehlgeschlagen" : ""}
                      </p>
                      {execution.isDemo || typeof execution.confidence === "number" ? (
                        <p className="mt-0.5 text-xs text-ink-500">
                          {execution.isDemo ? "Demo-Modus" : null}
                          {execution.isDemo && typeof execution.confidence === "number" ? ", " : null}
                          {typeof execution.confidence === "number"
                            ? `${Math.round(execution.confidence * 100)} % Vertrauen`
                            : null}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-ink-500">Noch keine Aktivität.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Termine heute" />
            <CardBody className="space-y-3">
              {todaysAppointments.length ? (
                todaysAppointments.map((appointment) => (
                  <div key={appointment.id} className="flex items-start gap-3">
                    <span data-numeric className="w-12 shrink-0 text-sm font-medium text-ink-800">
                      {formatTime(appointment.start)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink-800">
                        {appointment.title}
                        {appointment.status === "PROPOSED" ? (
                          <Badge tone="warning" className="ml-2 align-middle">
                            Vorschlag
                          </Badge>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-ink-500">
                        {appointment.employee
                          ? `${appointment.employee.firstName} ${appointment.employee.lastName}`
                          : "Noch niemandem zugewiesen"}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-ink-500">Heute stehen keine Termine an.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Diese Woche" />
            <CardBody>
              <p className="text-sm text-ink-600">
                Klarwerk hat geschätzt{" "}
                <span className="font-semibold text-ink-900">{formatHours(analytics.savedHours)}</span> Büroarbeit
                übernommen.
              </p>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-600">Anfragen</dt>
                  <dd data-numeric className="text-ink-900">{analytics.requests}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-600">Automatisch verarbeitet</dt>
                  <dd data-numeric className="text-ink-900">{analytics.processedAutomatically}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-600">Freigabequote</dt>
                  <dd data-numeric className="text-ink-900">{analytics.approvalRate} %</dd>
                </div>
              </dl>
              {analytics.byPriority.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {analytics.byPriority.map((entry) => (
                    <Badge key={entry.key} tone={entry.key === "URGENT" ? "danger" : entry.key === "HIGH" ? "warning" : "neutral"}>
                      {PRIORITY_LABELS[entry.key as keyof typeof PRIORITY_LABELS]}: {entry.count}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <Link href="/auswertung" className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline">
                Zur Auswertung
              </Link>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}

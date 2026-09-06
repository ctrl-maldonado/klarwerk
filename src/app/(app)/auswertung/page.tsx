import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/modules/auth/context";
import { getAnalytics } from "@/modules/analytics/service";
import { getUsageSummary } from "@/modules/billing/usage";
import { tenantDb } from "@/lib/tenant-db";
import { Card, CardBody, CardHeader, PageHeader, StatCard } from "@/components/ui";
import { formatHours } from "@/lib/utils";
import { PRIORITY_LABELS } from "@/modules/orders/service";

export const metadata: Metadata = { title: "Auswertung" };


export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ tage?: string }> }) {
  const context = await requireOnboarded();
  context.assert("analytics:read");

  const params = await searchParams;
  const days = [7, 30, 90].includes(Number(params.tage)) ? Number(params.tage) : 30;

  const [analytics, usage, categories] = await Promise.all([
    getAnalytics(context.tenant.id, days),
    getUsageSummary(context.tenant.id),
    tenantDb(context.tenant.id).emailCategory.findMany(),
  ]);

  const categoryLabels = Object.fromEntries(categories.map((category) => [category.key, category.label]));
  const maxCategory = Math.max(1, ...analytics.byCategory.map((entry) => entry.count));

  return (
    <>
      <PageHeader
        title="Auswertung"
        description={`Kennzahlen der letzten ${days} Tage.`}
        action={
          <div className="flex gap-1">
            {[7, 30, 90].map((value) => (
              <Link
                key={value}
                href={`/auswertung?tage=${value}`}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  value === days ? "bg-ink-900 text-white" : "bg-white text-ink-600 ring-1 ring-inset ring-ink-200"
                }`}
              >
                {value} Tage
              </Link>
            ))}
          </div>
        }
      />

      <Card className="mb-6 border-brand-200 bg-brand-50">
        <CardBody>
          <p className="text-sm font-medium text-brand-900">Zeit gespart</p>
          <p className="mt-1 text-3xl font-semibold text-brand-900">{formatHours(analytics.savedHours)}</p>
          <p className="mt-2 max-w-2xl text-sm text-brand-900/80">
            Geschätzt auf Basis der tatsächlich ausgeführten Schritte. Angenommene Bearbeitungszeit je Vorgang:{" "}
            {Object.entries(analytics.timeSavedAssumptions)
              .map(([key, minutes]) => `${key} ${minutes} Min.`)
              .join(", ")}
            . Es handelt sich um eine Schätzung, nicht um eine Messung.
          </p>
        </CardBody>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Anfragen" value={analytics.requests} />
        <StatCard label="Automatisch verarbeitet" value={analytics.processedAutomatically} />
        <StatCard label="Manuell bearbeitet" value={analytics.processedManually} />
        <StatCard
          label="Ø Bearbeitungszeit"
          value={analytics.averageHandlingMinutes !== null ? `${analytics.averageHandlingMinutes} Min.` : "—"}
        />
        <StatCard label="Freigabequote" value={`${analytics.approvalRate} %`} />
        <StatCard label="Abgelehnt" value={`${analytics.overrideRate} %`} hint="Korrekturquote" />
        <StatCard label="Fehlerrate AI" value={`${analytics.aiErrorRate} %`} tone={analytics.aiErrorRate > 5 ? "warning" : "neutral"} />
        <StatCard label="Offene Aufträge" value={analytics.openOrders} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Anfragen nach Kategorie" />
          <CardBody className="space-y-2">
            {analytics.byCategory.length ? (
              analytics.byCategory.map((entry) => (
                <div key={entry.key}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-700">{categoryLabels[entry.key] ?? entry.key}</span>
                    <span className="tabular-nums text-ink-500">{entry.count}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${(entry.count / maxCategory) * 100}%` }} />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-ink-500">Keine Daten im Zeitraum.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Aufträge nach Priorität" />
          <CardBody className="space-y-2 text-sm">
            {analytics.byPriority.length ? (
              analytics.byPriority.map((entry) => (
                <div key={entry.key} className="flex items-center justify-between">
                  <span className="text-ink-700">{PRIORITY_LABELS[entry.key as keyof typeof PRIORITY_LABELS] ?? entry.key}</span>
                  <span className="tabular-nums text-ink-500">{entry.count}</span>
                </div>
              ))
            ) : (
              <p className="text-ink-500">Keine Daten im Zeitraum.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="AI-Verbrauch" description="Aktueller Abrechnungsmonat." />
          <CardBody className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-700">AI-Vorgänge</span>
              <span className="tabular-nums text-ink-500">{usage.ai_calls ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-700">Verarbeitete E-Mails</span>
              <span className="tabular-nums text-ink-500">{usage.emails_processed ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-700">Dokumente</span>
              <span className="tabular-nums text-ink-500">{usage.documents ?? 0}</span>
            </div>
            <div className="flex justify-between border-t border-ink-100 pt-2">
              <span className="text-ink-700">Kosten im Zeitraum</span>
              <span className="tabular-nums text-ink-500">
                {analytics.aiCostEuro.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
              </span>
            </div>
            {analytics.demoShare > 0 ? (
              <p className="text-xs text-amber-700">
                {analytics.demoShare} % der Vorgänge liefen im Demo-Modus ohne KI-Modell.
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

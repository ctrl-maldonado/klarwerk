import type { Metadata } from "next";
import { requireOnboarded } from "@/modules/auth/context";
import { tenantDb } from "@/lib/tenant-db";
import { Badge, Card, CardBody, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Protokoll" };


const ACTION_LABELS: Record<string, string> = {
  login: "Anmeldung",
  login_failed: "Fehlgeschlagene Anmeldung",
  tenant_created: "Betrieb angelegt",
  onboarding_completed: "Einrichtung abgeschlossen",
  industry_profile_applied: "Branchenprofil übernommen",
  approval_requested: "Freigabe angefordert",
  approval_approved: "Freigabe erteilt",
  approval_rejected: "Freigabe abgelehnt",
  create_customer: "Kunde angelegt",
  update_customer: "Kunde geändert",
  create_order: "Auftrag angelegt",
  update_order: "Auftrag geändert",
  create_appointment: "Termin vorgeschlagen",
  confirm_appointment: "Termin gebucht",
  draft_email: "Antwortentwurf erstellt",
  send_email: "E-Mail versendet",
  create_task: "Aufgabe angelegt",
  document_uploaded: "Dokument hochgeladen",
  email_marked_handled: "E-Mail als erledigt markiert",
  workflow_completed: "Automation abgeschlossen",
  workflow_failed: "Automation fehlgeschlagen",
  workflow_enabled: "Automation aktiviert",
  workflow_disabled: "Automation pausiert",
  integration_connected: "Integration verbunden",
  settings_updated: "Einstellungen geändert",
  data_exported: "Daten exportiert",
};

const ACTOR_LABELS: Record<string, string> = {
  USER: "Mitarbeiter",
  AI: "Klarwerk",
  SYSTEM: "System",
  INTEGRATION: "Integration",
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ seite?: string }> }) {
  const context = await requireOnboarded();
  context.assert("audit:read");

  const params = await searchParams;
  const page = Math.max(1, Number(params.seite ?? 1) || 1);
  const perPage = 50;

  const db = tenantDb(context.tenant.id);
  const [entries, total] = await Promise.all([
    db.auditLog.findMany({
      orderBy: { at: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: { actorUser: true, aiExecution: true },
    }),
    db.auditLog.count(),
  ]);

  return (
    <>
      <PageHeader
        title="Protokoll"
        description="Jede relevante Aktion – von Menschen wie von Klarwerk. Einträge können nicht geändert oder gelöscht werden."
      />

      <Card>
        {entries.length ? (
          <CardBody className="divide-y divide-ink-100 px-0 py-0">
            {entries.map((entry) => (
              <div key={entry.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink-800">{ACTION_LABELS[entry.action] ?? entry.action}</span>
                    <Badge tone={entry.actorType === "AI" ? "brand" : entry.actorType === "SYSTEM" ? "neutral" : "info"}>
                      {ACTOR_LABELS[entry.actorType] ?? entry.actorType}
                    </Badge>
                    {entry.result !== "success" ? (
                      <Badge tone={entry.result === "rejected" ? "neutral" : "danger"}>{entry.result}</Badge>
                    ) : null}
                  </div>
                  <span className="text-xs tabular-nums text-ink-500">{formatDateTime(entry.at)}</span>
                </div>
                <p className="mt-0.5 text-xs text-ink-500">
                  {entry.actorLabel}
                  {entry.entityType ? ` · ${entry.entityType}` : ""}
                  {entry.approvedByLabel ? ` · freigegeben von ${entry.approvedByLabel}` : ""}
                  {entry.aiExecution ? ` · Modell ${entry.aiExecution.model}${entry.aiExecution.isDemo ? " (Demo)" : ""}` : ""}
                  {entry.ip ? ` · ${entry.ip}` : ""}
                </p>
                {(entry.details as Record<string, unknown>)?.summary ? (
                  <p className="mt-1 text-sm text-ink-600">{String((entry.details as Record<string, unknown>).summary)}</p>
                ) : null}
                {(entry.details as Record<string, unknown>)?.error ? (
                  <p className="mt-1 text-sm text-red-600">{String((entry.details as Record<string, unknown>).error)}</p>
                ) : null}
              </div>
            ))}
          </CardBody>
        ) : (
          <EmptyState title="Noch keine Einträge" />
        )}
      </Card>

      {total > perPage ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-ink-500">
            Seite {page} von {Math.ceil(total / perPage)} · {total} Einträge
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <a href={`/protokoll?seite=${page - 1}`} className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-inset ring-ink-200">
                Zurück
              </a>
            ) : null}
            {page * perPage < total ? (
              <a href={`/protokoll?seite=${page + 1}`} className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-inset ring-ink-200">
                Weiter
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

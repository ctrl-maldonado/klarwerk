import type { Metadata } from "next";
import { requireOnboarded } from "@/modules/auth/context";
import { tenantDb } from "@/lib/tenant-db";
import { getActionDefinition } from "@/modules/ai/action-catalog";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { toggleWorkflowAction } from "./actions";

export const metadata: Metadata = { title: "Automationen" };


const TRIGGER_LABELS: Record<string, string> = {
  EMAIL_RECEIVED: "Neue E-Mail",
  ORDER_CREATED: "Neuer Auftrag",
  APPOINTMENT_CHANGED: "Termin geändert",
  DOCUMENT_UPLOADED: "Dokument hochgeladen",
  MANUAL: "Manuell",
  SCHEDULE: "Zeitplan",
};

const STEP_LABELS: Record<string, string> = {
  ai_classify_email: "Nachricht einordnen",
  ai_extract_request: "Angaben auslesen",
  match_customer: "Kunde suchen",
  request_approval: "Freigabe einholen",
  notify_team: "Team benachrichtigen",
};

export default async function WorkflowsPage() {
  const context = await requireOnboarded();
  context.assert("workflows:read");
  const db = tenantDb(context.tenant.id);

  const [workflows, runs] = await Promise.all([
    db.workflow.findMany({ include: { steps: { orderBy: { sortOrder: "asc" } } }, orderBy: { createdAt: "asc" } }),
    db.workflowRun.findMany({ include: { workflow: true }, orderBy: { startedAt: "desc" }, take: 20 }),
  ]);

  return (
    <>
      <PageHeader
        title="Automationen"
        description="Was Klarwerk automatisch tut, wenn etwas passiert. Jeder Schritt mit Risiko wartet auf Ihre Freigabe."
      />

      <div className="space-y-6">
        {workflows.map((workflow) => (
          <Card key={workflow.id}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  {workflow.name}
                  <Badge tone={workflow.isActive ? "success" : "neutral"}>{workflow.isActive ? "aktiv" : "pausiert"}</Badge>
                </span>
              }
              description={workflow.description}
              action={
                context.can("workflows:write") ? (
                  <form action={toggleWorkflowAction}>
                    <input type="hidden" name="workflowId" value={workflow.id} />
                    <Button type="submit" variant="secondary" size="sm">
                      {workflow.isActive ? "Pausieren" : "Aktivieren"}
                    </Button>
                  </form>
                ) : null
              }
            />
            <CardBody>
              <p className="mb-3 text-xs font-medium text-ink-500">
                Auslöser: {TRIGGER_LABELS[workflow.trigger] ?? workflow.trigger}
              </p>
              <ol className="space-y-1.5">
                {workflow.steps.map((step, index) => {
                  const definition = step.actionKey ? getActionDefinition(step.actionKey) : null;
                  return (
                    <li key={step.id} className="flex items-start gap-3 text-sm">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[11px] font-semibold text-ink-600">
                        {index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="text-ink-800">
                          {step.label ||
                            (step.actionKey ? (STEP_LABELS[step.actionKey] ?? definition?.name ?? step.actionKey) : "Bedingung")}
                        </span>
                        {step.type === "condition" ? (
                          <Badge tone="info" className="ml-2">
                            Bedingung
                          </Badge>
                        ) : definition && definition.riskLevel !== "LOW" ? (
                          <Badge tone={definition.riskLevel === "HIGH" ? "danger" : "warning"} className="ml-2">
                            {definition.riskLevel === "HIGH" ? "Freigabe zwingend" : "Freigabe nötig"}
                          </Badge>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </CardBody>
          </Card>
        ))}
      </div>

      <section className="mt-10">
        <Card>
          <CardHeader title="Letzte Durchläufe" />
          {runs.length ? (
            <CardBody className="divide-y divide-ink-100 px-0 py-0">
              {runs.map((run) => (
                <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink-800">{run.workflow.name}</p>
                    <p className="text-xs text-ink-500">
                      {formatDateTime(run.startedAt)}
                      {run.error ? ` · ${run.error}` : ""}
                    </p>
                  </div>
                  <Badge
                    tone={
                      run.status === "FAILED"
                        ? "danger"
                        : run.status === "WAITING_APPROVAL"
                          ? "warning"
                          : run.status === "COMPLETED"
                            ? "success"
                            : "neutral"
                    }
                  >
                    {run.status === "WAITING_APPROVAL"
                      ? "wartet auf Freigabe"
                      : run.status === "COMPLETED"
                        ? "abgeschlossen"
                        : run.status === "FAILED"
                          ? "fehlgeschlagen"
                          : run.status}
                  </Badge>
                </div>
              ))}
            </CardBody>
          ) : (
            <EmptyState title="Noch keine Durchläufe" />
          )}
        </Card>
      </section>
    </>
  );
}

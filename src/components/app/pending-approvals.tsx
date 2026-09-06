import Link from "next/link";
import { Badge } from "@/components/ui";
import type { ApprovalView } from "@/components/app/approval-card";
import { cn, formatRelative } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Kompakte Freigabenliste für die Übersicht.

   Auf dem Dashboard wurden bisher die vollständigen Freigabekarten gerendert –
   mit allen Kontrollkästchen und dem kompletten Antworttext. Drei offene
   Vorgänge ergaben so knapp fünf Bildschirmlängen. Die Übersicht beantwortet
   jetzt nur noch "was wartet und wie dringend"; entschieden wird auf der
   Freigabenseite.
--------------------------------------------------------------------------- */

const RISK_LABELS: Record<string, string> = {
  LOW: "geringes Risiko",
  MEDIUM: "Freigabe nötig",
  HIGH: "Freigabe zwingend",
};

export function PendingApprovals({ approvals }: { approvals: ApprovalView[] }) {
  return (
    <ul className="divide-y divide-ink-200">
      {approvals.map((approval) => {
        const steps = approval.actions.length;
        return (
          <li key={approval.id}>
            <Link
              href={`/freigaben/${approval.id}`}
              className={cn(
                "flex items-start gap-3 border-l-2 px-4 py-3 transition-colors hover:bg-ink-50",
                approval.riskLevel === "HIGH" ? "border-l-red-600" : "border-l-amber-600",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink-900">{approval.title}</span>
                  {approval.riskLevel === "HIGH" ? <Badge tone="danger">{RISK_LABELS.HIGH}</Badge> : null}
                  {approval.lowConfidence.length ? <Badge tone="warning">unsichere Angaben</Badge> : null}
                </span>
                <span className="mt-0.5 line-clamp-1 block text-sm text-ink-600">{approval.summary}</span>
                <span className="mt-1 block text-xs text-ink-500">
                  {steps} {steps === 1 ? "Schritt" : "Schritte"} vorbereitet, {formatRelative(approval.createdAt)}
                </span>
              </span>
              <span className="shrink-0 self-center text-sm font-medium text-brand-700">Prüfen</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

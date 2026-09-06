import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/modules/auth/context";
import { tenantDb } from "@/lib/tenant-db";
import { customerDisplayName } from "@/modules/customers/service";
import { Badge, Card, CardHeader, EmptyState, LinkedRow, PageHeader, Table, Td, Th } from "@/components/ui";
import { cn, formatDateTime, formatRelative } from "@/lib/utils";

export const metadata: Metadata = { title: "Freigaben" };

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Offen",
  APPROVED: "Freigegeben",
  EXECUTED: "Ausgeführt",
  REJECTED: "Abgelehnt",
  FAILED: "Fehlgeschlagen",
  EXPIRED: "Abgelaufen",
};

const STATUS_TONES: Record<string, "success" | "neutral" | "danger" | "info"> = {
  EXECUTED: "success",
  REJECTED: "neutral",
  FAILED: "danger",
  EXPIRED: "neutral",
  APPROVED: "info",
};

export default async function ApprovalsPage() {
  const context = await requireOnboarded();
  const db = tenantDb(context.tenant.id);

  const [pending, decided] = await Promise.all([
    db.approvalRequest.findMany({ where: { status: { in: ["PENDING", "FAILED"] } }, orderBy: { createdAt: "asc" } }),
    db.approvalRequest.findMany({
      where: { status: { in: ["EXECUTED", "REJECTED", "APPROVED", "EXPIRED"] } },
      orderBy: { decidedAt: "desc" },
      take: 25,
      include: { decidedBy: true },
    }),
  ]);

  /* Der Betreff der auslösenden Nachricht führt die Zeile an – er sagt beim
     Überfliegen mehr als der erzeugte Titel ("Neue Anfrage von …"), der die
     Absenderin ohnehin nur wiederholt. Kunde und Betreff kommen aus einer
     Abfrage für alle Zeilen, nicht aus einer je Zeile. */
  const sourceIds = pending
    .filter((approval) => approval.sourceType === "email" && approval.sourceId)
    .map((approval) => approval.sourceId as string);

  const sources = sourceIds.length
    ? await db.email.findMany({
        where: { id: { in: sourceIds } },
        select: { id: true, subject: true, fromName: true, fromEmail: true, customer: true },
      })
    : [];
  const sourceById = new Map(sources.map((email) => [email.id, email]));

  /* Reihenfolge nach Dringlichkeit: abgebrochene Ausführungen zuerst – dort
     hängt eine bereits erteilte Freigabe halb fertig fest –, dann zwingende
     Freigaben, dann das Älteste. */
  const queue = [...pending].sort((a, b) => {
    const rank = (status: string, risk: string) => (status === "FAILED" ? 0 : risk === "HIGH" ? 1 : 2);
    return (
      rank(a.status, a.riskLevel) - rank(b.status, b.riskLevel) ||
      a.createdAt.getTime() - b.createdAt.getTime()
    );
  });

  const failedCount = queue.filter((approval) => approval.status === "FAILED").length;

  return (
    <>
      <PageHeader
        title="Freigaben"
        description="Alles, was Klarwerk vorbereitet hat und was Ihre Bestätigung braucht. Ein Vorgang wird auf seiner eigenen Seite geprüft und entschieden."
        action={
          queue.length ? (
            <p className="text-sm text-ink-600">
              <span className="font-semibold text-ink-900" data-numeric>
                {queue.length}
              </span>{" "}
              {queue.length === 1 ? "Vorgang wartet" : "Vorgänge warten"}
              {failedCount ? (
                <>
                  {" · "}
                  <span className="font-medium text-red-700" data-numeric>
                    {failedCount} abgebrochen
                  </span>
                </>
              ) : null}
            </p>
          ) : null
        }
      />

      <Card className="overflow-hidden">
        {queue.length ? (
          <Table caption="Offene Freigaben mit Betreff, Kunde, Zustand, Anzahl der Schritte und Wartezeit">
            <thead className="kw-table-head">
              <tr>
                <Th className="w-full">Betreff</Th>
                <Th className="w-56">Kunde</Th>
                <Th className="w-56">Zustand</Th>
                <Th align="right" className="w-20">
                  Schritte
                </Th>
                <Th align="right" className="w-28">
                  Wartet seit
                </Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200">
              {queue.map((approval) => {
                const failed = approval.status === "FAILED";
                const high = approval.riskLevel === "HIGH";
                const steps = ((approval.proposedActions as unknown as unknown[]) ?? []).length;
                const uncertain = ((approval.context as Record<string, any>)?.lowConfidence as string[])?.length;
                const source = approval.sourceId ? sourceById.get(approval.sourceId) : undefined;
                const subject = source?.subject || approval.title;

                return (
                  <LinkedRow key={approval.id} href={`/freigaben/${approval.id}`}>
                    <Td className="max-w-0">
                      <div className="flex items-center gap-2">
                        {/* Den Balken bekommt nur der abgebrochene Lauf. Die
                            Risikostufe steht schon als Wort in "Zustand", und
                            hier warten ohnehin nur freigabepflichtige Vorgänge –
                            ein Balken auf jeder Zeile wäre keine Ausnahme mehr,
                            sondern Tapete. */}
                        <span
                          aria-hidden
                          className={cn(
                            "kw-priority-rule inline-block h-3.5 w-0.5 shrink-0",
                            failed ? "bg-red-600" : "bg-transparent",
                          )}
                        />
                        <Link
                          href={`/freigaben/${approval.id}`}
                          title={subject}
                          className="min-w-0 truncate font-medium text-ink-900 underline-offset-2 hover:text-brand-700 hover:underline"
                        >
                          {subject}
                        </Link>
                      </div>
                    </Td>
                    {/* Der Kunde führt in die Kundenakte, nicht in die Freigabe:
                        die häufigste Rückfrage beim Prüfen ist "was hatten wir
                        mit denen zuletzt?". */}
                    <Td className="truncate">
                      {source?.customer ? (
                        <Link
                          href={`/kunden/${source.customer.id}`}
                          className="text-ink-700 underline-offset-2 hover:text-brand-700 hover:underline"
                        >
                          {customerDisplayName(source.customer)}
                        </Link>
                      ) : source ? (
                        <span className="text-ink-600" title={source.fromEmail}>
                          {source.fromName || source.fromEmail}
                        </span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </Td>
                    <Td>
                      <span className="flex items-center gap-1 whitespace-nowrap">
                        {failed ? (
                          <Badge tone="danger">Abgebrochen</Badge>
                        ) : high ? (
                          <Badge tone="warning">Freigabe zwingend</Badge>
                        ) : null}
                        {uncertain ? <Badge tone="warning">unsichere Angaben</Badge> : null}
                        {!failed && !high && !uncertain ? <span className="text-ink-400">—</span> : null}
                      </span>
                    </Td>
                    <Td align="right" className="text-ink-600">
                      {steps}
                    </Td>
                    <Td align="right" className="whitespace-nowrap text-ink-600">
                      <time dateTime={approval.createdAt.toISOString()}>{formatRelative(approval.createdAt)}</time>
                    </Td>
                  </LinkedRow>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState
            title="Keine offenen Freigaben"
            description="Sobald eine neue Anfrage eingeht, finden Sie hier den fertigen Vorschlag."
          />
        )}
      </Card>

      {decided.length ? (
        <section className="mt-10">
          <Card className="overflow-hidden">
            <CardHeader
              title="Bereits entschieden"
              description={
                decided.length === 1
                  ? "Der letzte entschiedene Vorgang mit Ergebnis und Zeitpunkt."
                  : `Die letzten ${decided.length} Vorgänge mit Ergebnis, Entscheidung und Zeitpunkt.`
              }
            />
            <Table caption="Bereits entschiedene Freigaben">
              <thead className="kw-table-head">
                <tr>
                  <Th className="w-full">Vorgang</Th>
                  <Th className="w-32">Ergebnis</Th>
                  <Th className="w-64">Notiz</Th>
                  <Th className="w-40">Entschieden von</Th>
                  <Th align="right" className="w-36">
                    Zeitpunkt
                  </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {decided.map((approval) => (
                  <LinkedRow key={approval.id} href={`/freigaben/${approval.id}`}>
                    <Td className="max-w-0">
                      <Link
                        href={`/freigaben/${approval.id}`}
                        title={approval.title}
                        className="block truncate font-medium text-ink-800 underline-offset-2 hover:text-brand-700 hover:underline"
                      >
                        {approval.title}
                      </Link>
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONES[approval.status] ?? "neutral"}>{STATUS_LABELS[approval.status]}</Badge>
                    </Td>
                    <Td className="max-w-0">
                      {approval.decisionNote ? (
                        <span className="block truncate text-ink-600" title={approval.decisionNote}>
                          {approval.decisionNote}
                        </span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-ink-600">
                      {approval.decidedBy?.name ?? <span className="text-ink-400">—</span>}
                    </Td>
                    <Td align="right" className="whitespace-nowrap text-ink-600">
                      {approval.decidedAt ? (
                        <time dateTime={approval.decidedAt.toISOString()}>{formatDateTime(approval.decidedAt)}</time>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </Td>
                  </LinkedRow>
                ))}
              </tbody>
            </Table>
          </Card>
        </section>
      ) : null}
    </>
  );
}

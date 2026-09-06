import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/modules/auth/context";
import { tenantDb } from "@/lib/tenant-db";
import { customerDisplayName } from "@/modules/customers/service";
import { PRIORITY_LABELS } from "@/modules/orders/service";
import { Badge, Card, EmptyState, LinkedRow, PageHeader, Ref, StatusTag, Table, Td, Th } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import type { Priority } from "@prisma/client";

export const metadata: Metadata = { title: "Aufträge" };


export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string }>;
}) {
  const context = await requireOnboarded();
  context.assert("orders:read");
  const db = tenantDb(context.tenant.id);
  const params = await searchParams;

  const [statuses, orders] = await Promise.all([
    db.orderStatus.findMany({ orderBy: { sortOrder: "asc" } }),
    db.order.findMany({
      where: {
        deletedAt: null,
        ...(params.status ? { status: { key: params.status } } : {}),
        ...(params.priority ? { priority: params.priority as Priority } : {}),
      },
      include: { customer: true, status: true, technician: true },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
  ]);

  const buildHref = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { status: params.status, priority: params.priority, ...patch };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const query = next.toString();
    return `/auftraege${query ? `?${query}` : ""}`;
  };

  const filtered = Boolean(params.status || params.priority);

  return (
    <>
      <PageHeader
        title="Aufträge"
        description={
          orders.length === 100
            ? "Die 100 neuesten Aufträge. Grenzen Sie die Liste über die Filter weiter ein."
            : `${orders.length} ${orders.length === 1 ? "Auftrag" : "Aufträge"}${filtered ? " im gewählten Filter" : ""}.`
        }
      />

      <div className="mb-3 space-y-1.5">
        <div className="flex flex-wrap gap-1">
          <Link href={buildHref({ status: undefined })} className={chip(!params.status)}>
            Alle Status
          </Link>
          {statuses.map((status) => (
            <Link key={status.id} href={buildHref({ status: status.key })} className={chip(params.status === status.key)}>
              {status.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          <Link href={buildHref({ priority: undefined })} className={chip(!params.priority)}>
            Alle Prioritäten
          </Link>
          {(["URGENT", "HIGH", "NORMAL", "LOW"] as const).map((priority) => (
            <Link key={priority} href={buildHref({ priority })} className={chip(params.priority === priority)}>
              {PRIORITY_LABELS[priority]}
            </Link>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        {orders.length ? (
          <Table caption="Aufträge mit Nummer, Kunde, Status, Priorität, zuständigem Monteur und Anlagedatum">
            <thead className="kw-table-head">
              <tr>
                <Th className="w-24">Nummer</Th>
                <Th className="w-full">Auftrag</Th>
                <Th className="w-40">Kunde</Th>
                <Th className="w-32">Status</Th>
                <Th className="w-20">Priorität</Th>
                <Th className="w-28">Monteur</Th>
                <Th align="right" className="w-20">
                  Angelegt
                </Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200">
              {orders.map((order) => {
                // Nur Abweichungen bekommen Farbe. Ein normal priorisierter
                // Auftrag trägt keine Markierung – sonst verliert die
                // Signalfarbe genau dann ihre Wirkung, wenn es eilt.
                const urgent = order.priority === "URGENT";
                const high = order.priority === "HIGH";
                return (
                  <LinkedRow key={order.id} href={`/auftraege/${order.id}`}>
                    <Td className="whitespace-nowrap">
                      <span
                        aria-hidden
                        className={cn(
                          "kw-priority-rule mr-2 inline-block h-3.5 w-0.5 align-middle",
                          urgent ? "bg-red-600" : high ? "bg-amber-600" : "bg-transparent",
                        )}
                      />
                      <Ref>{order.orderNumber}</Ref>
                    </Td>
                    {/* max-w-0 zwingt die Spalte, den Rest der Breite zu füllen und
                        den Titel einzeilig abzuschneiden: gleich hohe Zeilen lassen
                        sich schneller überfliegen, der volle Titel steht im Auftrag. */}
                    <Td className="max-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/auftraege/${order.id}`}
                          title={order.title}
                          className="min-w-0 truncate font-medium text-ink-900 underline-offset-2 hover:text-brand-700 hover:underline"
                        >
                          {order.title}
                        </Link>
                        {order.createdByAI ? (
                          <Badge tone="brand" className="shrink-0">
                            von Klarwerk
                          </Badge>
                        ) : null}
                      </div>
                    </Td>
                    <Td className="truncate text-ink-700">{order.customer ? customerDisplayName(order.customer) : "—"}</Td>
                    <Td>
                      <StatusTag label={order.status.label} color={order.status.color} />
                    </Td>
                    <Td
                      className={cn(
                        "whitespace-nowrap",
                        urgent ? "font-medium text-red-700" : high ? "text-amber-800" : "text-ink-500",
                      )}
                    >
                      {urgent || high ? PRIORITY_LABELS[order.priority] : "—"}
                    </Td>
                    <Td className="truncate text-ink-600">
                      {order.technician ? `${order.technician.firstName} ${order.technician.lastName}` : "—"}
                    </Td>
                    <Td align="right" className="whitespace-nowrap text-ink-600">
                      <time dateTime={order.createdAt.toISOString()}>{formatDate(order.createdAt)}</time>
                    </Td>
                  </LinkedRow>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState
            title={filtered ? "Kein Auftrag passt zu diesem Filter" : "Noch keine Aufträge"}
            description={
              filtered
                ? "Setzen Sie einen Filter zurück, um mehr Aufträge zu sehen."
                : "Sobald eine Anfrage eingeht, legt Klarwerk den passenden Auftrag an und fragt Ihre Freigabe ab."
            }
          />
        )}
      </Card>
    </>
  );
}

function chip(active: boolean) {
  return cn(
    "inline-flex min-h-7 items-center rounded-lg px-2.5 py-1 text-sm transition-colors",
    active
      ? "bg-ink-800 text-white"
      : "border border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:text-ink-900",
  );
}

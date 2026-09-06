import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboarded } from "@/modules/auth/context";
import { tenantDb } from "@/lib/tenant-db";
import { customerDisplayName } from "@/modules/customers/service";
import { PRIORITY_LABELS } from "@/modules/orders/service";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, formatDateTime, truncate } from "@/lib/utils";

export const metadata: Metadata = { title: "Kunde" };


export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireOnboarded();
  context.assert("customers:read");
  const { id } = await params;
  const db = tenantDb(context.tenant.id);

  const customer = await db.customer.findFirst({
    where: { id },
    include: {
      contacts: true,
      orders: { include: { status: true }, orderBy: { createdAt: "desc" } },
      appointments: { orderBy: { start: "desc" }, take: 10, include: { employee: true } },
      emails: { orderBy: { receivedAt: "desc" }, take: 10 },
      documents: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!customer) notFound();

  const customFieldValues = await db.customFieldValue.findMany({
    where: { entityType: "customer", entityId: customer.id },
    include: { customField: true },
  });

  const address = [customer.street, `${customer.zip ?? ""} ${customer.city ?? ""}`.trim()].filter(Boolean).join(", ");

  return (
    <>
      <PageHeader
        title={customerDisplayName(customer)}
        description={`Kundennummer ${customer.customerNumber} · angelegt am ${formatDate(customer.createdAt)}`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <aside className="space-y-6">
          <Card>
            <CardHeader title="Stammdaten" />
            <CardBody className="space-y-2 text-sm">
              {address ? <p className="text-ink-700">{address}</p> : null}
              {customer.email ? (
                <p>
                  <a href={`mailto:${customer.email}`} className="text-brand-700 hover:underline">
                    {customer.email}
                  </a>
                </p>
              ) : null}
              {customer.phone ? <p className="text-ink-700">{customer.phone}</p> : null}
              {customer.notes ? <p className="whitespace-pre-line border-t border-ink-100 pt-2 text-ink-600">{customer.notes}</p> : null}
              {customFieldValues.length ? (
                <div className="border-t border-ink-100 pt-2">
                  {customFieldValues.map((value) => (
                    <p key={value.id} className="text-ink-600">
                      <span className="text-ink-500">{value.customField.label}:</span> {String(value.value)}
                    </p>
                  ))}
                </div>
              ) : null}
            </CardBody>
          </Card>

          {customer.contacts.length ? (
            <Card>
              <CardHeader title="Ansprechpartner" />
              <CardBody className="space-y-2 text-sm">
                {customer.contacts.map((contact) => (
                  <div key={contact.id}>
                    <p className="font-medium text-ink-800">{contact.name}</p>
                    <p className="text-ink-500">{[contact.role, contact.email, contact.phone].filter(Boolean).join(" · ")}</p>
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : null}
        </aside>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Aufträge" description={`${customer.orders.length} insgesamt`} />
            {customer.orders.length ? (
              <CardBody className="divide-y divide-ink-100 px-0 py-0">
                {customer.orders.map((order) => (
                  <Link key={order.id} href={`/auftraege/${order.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-ink-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-800">{order.title}</p>
                      <p className="text-xs text-ink-500">
                        {order.orderNumber} · {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={order.priority === "URGENT" ? "danger" : order.priority === "HIGH" ? "warning" : "neutral"}>
                        {PRIORITY_LABELS[order.priority]}
                      </Badge>
                      <span className="text-xs font-medium" style={{ color: order.status.color }}>
                        {order.status.label}
                      </span>
                    </div>
                  </Link>
                ))}
              </CardBody>
            ) : (
              <EmptyState title="Noch keine Aufträge" />
            )}
          </Card>

          <div className="grid gap-6 sm:grid-cols-2">
            <Card>
              <CardHeader title="Termine" />
              {customer.appointments.length ? (
                <CardBody className="space-y-2 text-sm">
                  {customer.appointments.map((appointment) => (
                    <div key={appointment.id}>
                      <p className="text-ink-800">{formatDateTime(appointment.start)}</p>
                      <p className="text-xs text-ink-500">
                        {appointment.title}
                        {appointment.employee ? ` · ${appointment.employee.firstName} ${appointment.employee.lastName}` : ""}
                        {appointment.status === "PROPOSED" ? " · Vorschlag" : ""}
                      </p>
                    </div>
                  ))}
                </CardBody>
              ) : (
                <EmptyState title="Keine Termine" />
              )}
            </Card>

            <Card>
              <CardHeader title="Kommunikation" />
              {customer.emails.length ? (
                <CardBody className="space-y-2 text-sm">
                  {customer.emails.map((email) => (
                    <Link key={email.id} href={`/emails/${email.id}`} className="block hover:underline">
                      <p className="truncate text-ink-800">{email.subject || "(kein Betreff)"}</p>
                      <p className="text-xs text-ink-500">
                        {email.direction === "INBOUND" ? "Eingang" : "Ausgang"} · {formatDate(email.receivedAt)}
                      </p>
                    </Link>
                  ))}
                </CardBody>
              ) : (
                <EmptyState title="Keine Nachrichten" />
              )}
            </Card>
          </div>

          {customer.documents.length ? (
            <Card>
              <CardHeader title="Dokumente" />
              <CardBody className="space-y-1 text-sm">
                {customer.documents.map((document) => (
                  <p key={document.id} className="text-ink-700">
                    📎 {document.filename}{" "}
                    <span className="text-xs text-ink-500">{truncate((document.aiExtraction as any)?.summary ?? "", 60)}</span>
                  </p>
                ))}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

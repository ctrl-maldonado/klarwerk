import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboarded } from "@/modules/auth/context";
import { tenantDb } from "@/lib/tenant-db";
import { customerDisplayName } from "@/modules/customers/service";
import { PRIORITY_LABELS } from "@/modules/orders/service";
import { getTenantIndustryProfile } from "@/modules/tenants/provisioning";
import { Badge, Card, CardBody, CardHeader, ConfidenceBar, PageHeader, StatusTag } from "@/components/ui";
import { formatDate, formatDateTime, toDateTimeLocal } from "@/lib/utils";
import { OrderForm } from "./order-form";
import { AppointmentForm } from "./appointment-form";
import { DocumentUpload } from "@/components/app/document-upload";

export const metadata: Metadata = { title: "Auftrag" };


export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireOnboarded();
  context.assert("orders:read");
  const { id } = await params;
  const db = tenantDb(context.tenant.id);

  const order = await db.order.findFirst({
    where: { id },
    include: {
      customer: true,
      status: true,
      technician: true,
      appointments: { include: { employee: true }, orderBy: { start: "asc" } },
      documents: true,
    },
  });
  if (!order) notFound();

  const [statuses, employees, profile, customFieldValues, sourceEmail] = await Promise.all([
    db.orderStatus.findMany({ orderBy: { sortOrder: "asc" } }),
    db.employee.findMany({ where: { isActive: true }, orderBy: { lastName: "asc" } }),
    getTenantIndustryProfile(context.tenant.id, context.tenant.industryKey),
    db.customFieldValue.findMany({ where: { entityType: "order", entityId: order.id }, include: { customField: true } }),
    order.sourceEmailId ? db.email.findFirst({ where: { id: order.sourceEmailId } }) : null,
  ]);

  const category = profile.orderCategories.find((entry) => entry.key === order.categoryKey);

  return (
    <>
      <PageHeader
        title={order.title}
        description={`${order.orderNumber} · angelegt am ${formatDate(order.createdAt)}${order.createdByAI ? " von Klarwerk" : ""}`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Beschreibung"
              action={
                <div className="flex items-center gap-2">
                  <Badge tone={order.priority === "URGENT" ? "danger" : order.priority === "HIGH" ? "warning" : "neutral"}>
                    {PRIORITY_LABELS[order.priority]}
                  </Badge>
                  <StatusTag label={order.status.label} color={order.status.color} />
                </div>
              }
            />
            <CardBody>
              {order.aiSummary ? (
                <div className="mb-3 rounded-lg bg-brand-50 px-3 py-2">
                  <p className="text-xs font-semibold text-brand-700">Zusammenfassung von Klarwerk</p>
                  <p className="mt-1 text-sm text-ink-700">{order.aiSummary}</p>
                  {typeof order.aiConfidence === "number" ? (
                    <div className="mt-2">
                      <ConfidenceBar value={order.aiConfidence} label="Vertrauen" />
                    </div>
                  ) : null}
                </div>
              ) : null}
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-700">{order.description || "—"}</p>
              {customFieldValues.length ? (
                <dl className="mt-4 grid gap-2 border-t border-ink-100 pt-3 sm:grid-cols-2">
                  {customFieldValues.map((value) => (
                    <div key={value.id}>
                      <dt className="text-xs text-ink-500">{value.customField.label}</dt>
                      <dd className="text-sm text-ink-800">{String(value.value)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </CardBody>
          </Card>

          {context.can("orders:write") ? (
            <Card>
              <CardHeader title="Auftrag ändern" />
              <CardBody>
                <OrderForm
                  orderId={order.id}
                  statuses={statuses.map((status) => ({ key: status.key, label: status.label }))}
                  employees={employees.map((employee) => ({ id: employee.id, name: `${employee.firstName} ${employee.lastName}` }))}
                  current={{ statusKey: order.status.key, priority: order.priority, technicianId: order.technicianId }}
                />
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Termine" />
            <CardBody className="space-y-4 text-sm">
              {order.appointments.length ? (
                order.appointments.map((appointment) => (
                  <div key={appointment.id} className="border-b border-ink-100 pb-4 last:border-b-0 last:pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-ink-800">
                          <time dateTime={appointment.start.toISOString()}>{formatDateTime(appointment.start)}</time>
                        </p>
                        <p className="text-xs text-ink-500">
                          {appointment.employee
                            ? `${appointment.employee.firstName} ${appointment.employee.lastName}`
                            : "Noch niemandem zugewiesen"}
                          {appointment.location ? ` · ${appointment.location}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          tone={
                            appointment.status === "CONFIRMED"
                              ? "success"
                              : appointment.status === "PROPOSED"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {appointment.status === "CONFIRMED"
                            ? "bestätigt"
                            : appointment.status === "PROPOSED"
                              ? "Vorschlag"
                              : appointment.status === "CANCELLED"
                                ? "abgesagt"
                                : appointment.status}
                        </Badge>
                        {context.can("calendar:write") ? (
                          <AppointmentForm
                            appointmentId={appointment.id}
                            orderId={order.id}
                            employees={employees.map((employee) => ({
                              id: employee.id,
                              name: `${employee.firstName} ${employee.lastName}`,
                            }))}
                            current={{
                              start: toDateTimeLocal(appointment.start),
                              employeeId: appointment.employeeId,
                              status: appointment.status,
                            }}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-ink-500">Noch kein Termin geplant.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Anhänge" description={`${order.documents.length} Dokumente an diesem Auftrag.`} />
            {order.documents.length ? (
              <CardBody className="divide-y divide-ink-100 px-0 py-0">
                {order.documents.map((document) => (
                  <div key={document.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <a
                      href={`/api/dokumente/${document.id}`}
                      className="truncate text-sm font-medium text-brand-700 hover:underline"
                    >
                      {document.filename}
                    </a>
                    <span data-numeric className="shrink-0 text-xs text-ink-500">
                      {formatDate(document.createdAt)} · {Math.round(document.size / 1024)} kB
                    </span>
                  </div>
                ))}
              </CardBody>
            ) : (
              <CardBody>
                <p className="text-sm text-ink-500">
                  Noch keine Anhänge. Angebote, Rechnungen und Fotos zu diesem Auftrag gehören hierher.
                </p>
              </CardBody>
            )}
            {context.can("documents:write") ? (
              <div className="border-t border-ink-200 px-4 py-3">
                <DocumentUpload
                  fixedOrderId={order.id}
                  fixedCustomerId={order.customerId}
                  submitLabel="An Auftrag anhängen"
                />
              </div>
            ) : null}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Kunde" />
            <CardBody className="space-y-1 text-sm">
              {order.customer ? (
                <>
                  <Link href={`/kunden/${order.customer.id}`} className="font-medium text-brand-700 hover:underline">
                    {customerDisplayName(order.customer)}
                  </Link>
                  <p className="text-ink-600">{order.customer.phone}</p>
                  <p className="text-ink-600">{order.customer.email}</p>
                </>
              ) : (
                <p className="text-ink-500">Kein Kunde zugeordnet.</p>
              )}
              {order.street || order.city ? (
                <p className="border-t border-ink-100 pt-2 text-ink-600">
                  Einsatzort: {[order.street, `${order.zip ?? ""} ${order.city ?? ""}`.trim()].filter(Boolean).join(", ")}
                </p>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Einordnung" />
            <CardBody className="space-y-1 text-sm text-ink-600">
              <p>Kategorie: {category?.label ?? order.categoryKey}</p>
              {category ? <p>Geplante Dauer: {category.estimatedMinutes} Minuten</p> : null}
              {category?.requiredSkills.length ? <p>Qualifikation: {category.requiredSkills.join(", ")}</p> : null}
              {sourceEmail ? (
                <p className="border-t border-ink-100 pt-2">
                  Ursprung:{" "}
                  <Link href={`/emails/${sourceEmail.id}`} className="text-brand-700 hover:underline">
                    E-Mail von {sourceEmail.fromName || sourceEmail.fromEmail}
                  </Link>
                </p>
              ) : null}
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}

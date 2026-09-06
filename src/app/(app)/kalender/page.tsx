import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/modules/auth/context";
import { tenantDb } from "@/lib/tenant-db";
import { customerDisplayName } from "@/modules/customers/service";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/utils";
import { ConfirmAppointment } from "./confirm-appointment";

export const metadata: Metadata = { title: "Kalender" };


const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  const day = (copy.getDay() + 6) % 7; // Montag = 0
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ woche?: string }> }) {
  const context = await requireOnboarded();
  context.assert("calendar:read");
  const db = tenantDb(context.tenant.id);

  const params = await searchParams;
  const offset = Number(params.woche ?? 0) || 0;
  const weekStart = startOfWeek(new Date());
  weekStart.setDate(weekStart.getDate() + offset * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [appointments, employees, absences, businessHours] = await Promise.all([
    db.appointment.findMany({
      where: { start: { gte: weekStart, lt: weekEnd }, status: { in: ["PROPOSED", "CONFIRMED", "DONE"] } },
      include: { employee: true, customer: true, order: true },
      orderBy: { start: "asc" },
    }),
    db.employee.findMany({ where: { isActive: true, isTechnician: true }, orderBy: { lastName: "asc" } }),
    db.absence.findMany({ where: { start: { lt: weekEnd }, end: { gt: weekStart } }, include: { employee: true } }),
    db.businessHour.findMany(),
  ]);

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    return date;
  });

  const today = new Date().toDateString();

  return (
    <>
      <PageHeader
        title="Kalender"
        description={`Woche vom ${formatDate(weekStart)} bis ${formatDate(new Date(weekEnd.getTime() - 86400000))}`}
        action={
          <div className="flex items-center gap-1">
            <Link href={`/kalender?woche=${offset - 1}`} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-inset ring-ink-200 hover:bg-ink-50">
              ← Vorherige
            </Link>
            <Link href="/kalender" className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-inset ring-ink-200 hover:bg-ink-50">
              Heute
            </Link>
            <Link href={`/kalender?woche=${offset + 1}`} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-inset ring-ink-200 hover:bg-ink-50">
              Nächste →
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {employees.map((employee) => (
          <span key={employee.id} className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs ring-1 ring-inset ring-ink-200">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: employee.color }} />
            {employee.firstName} {employee.lastName}
            {employee.skills.length ? <span className="text-ink-500">· {employee.skills.join(", ")}</span> : null}
          </span>
        ))}
      </div>

      {/* Das Wochenraster ist breiter als schmale Fenster. Ohne tabIndex lässt
          es sich nur mit der Maus waagerecht bewegen. */}
      <div className="kw-scroll overflow-x-auto" tabIndex={0} role="region" aria-label="Wochenübersicht der Termine">
        <div className="grid min-w-[900px] grid-cols-7 gap-3">
          {days.map((day, index) => {
            const dayAppointments = appointments.filter((appointment) => appointment.start.toDateString() === day.toDateString());
            const hours = businessHours.find((entry) => entry.weekday === day.getDay());
            const dayAbsences = absences.filter((absence) => absence.start <= day && absence.end >= day);

            return (
              <div key={day.toISOString()} className="rounded-xl border border-ink-200 bg-white">
                <div className={`border-b border-ink-200 px-3 py-2 ${day.toDateString() === today ? "bg-brand-50" : ""}`}>
                  <p className="text-xs font-semibold text-ink-900">{WEEKDAYS[index]}</p>
                  <p className="text-xs text-ink-500">
                    {formatDate(day)}
                    {hours?.isClosed ? " · geschlossen" : hours ? ` · ${hours.startTime}–${hours.endTime}` : ""}
                  </p>
                </div>
                <div className="space-y-2 p-2">
                  {dayAbsences.map((absence) => (
                    <div key={absence.id} className="rounded-lg bg-ink-100 px-2 py-1 text-[11px] text-ink-500">
                      {absence.employee.firstName} {absence.employee.lastName}: {absence.reason}
                    </div>
                  ))}
                  {dayAppointments.length ? (
                    dayAppointments.map((appointment) => (
                      <div
                        key={appointment.id}
                        className="rounded-lg border-l-2 bg-ink-50 px-2 py-1.5"
                        style={{ borderColor: appointment.employee?.color ?? "#94a3b8" }}
                      >
                        <p className="text-[11px] font-semibold tabular-nums text-ink-800">
                          {formatTime(appointment.start)}–{formatTime(appointment.end)}
                        </p>
                        <p className="text-[11px] text-ink-700">{appointment.title}</p>
                        <p className="text-[11px] text-ink-500">
                          {appointment.employee ? `${appointment.employee.firstName} ${appointment.employee.lastName}` : "offen"}
                        </p>
                        {appointment.customer ? (
                          <p className="truncate text-[11px] text-ink-500">{customerDisplayName(appointment.customer)}</p>
                        ) : null}
                        {appointment.status === "PROPOSED" ? (
                          <span className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                            Vorschlag
                          </span>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="px-1 py-2 text-[11px] text-ink-500">Keine Termine</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <section className="mt-8">
        <Card>
          <CardHeader title="Terminvorschläge" description="Vorschläge werden erst nach Bestätigung verbindlich." />
          {appointments.some((appointment) => appointment.status === "PROPOSED") ? (
            <CardBody className="divide-y divide-ink-100 px-0 py-0">
              {appointments
                .filter((appointment) => appointment.status === "PROPOSED")
                .map((appointment) => (
                  <div key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-800">
                        {formatDate(appointment.start)} · {formatTime(appointment.start)}–{formatTime(appointment.end)}
                      </p>
                      <p className="text-xs text-ink-500">
                        {appointment.title}
                        {appointment.employee ? ` · ${appointment.employee.firstName} ${appointment.employee.lastName}` : ""}
                        {appointment.createdByAI ? " · von Klarwerk vorgeschlagen" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {appointment.order ? (
                        <Link href={`/auftraege/${appointment.order.id}`} className="text-sm text-brand-700 hover:underline">
                          {appointment.order.orderNumber}
                        </Link>
                      ) : null}
                      {context.can("calendar:write") ? <ConfirmAppointment appointmentId={appointment.id} /> : <Badge tone="warning">Vorschlag</Badge>}
                    </div>
                  </div>
                ))}
            </CardBody>
          ) : (
            <EmptyState title="Keine offenen Terminvorschläge" />
          )}
        </Card>
      </section>
    </>
  );
}

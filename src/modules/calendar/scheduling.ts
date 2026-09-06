import type { Priority } from "@prisma/client";
import { tenantDb } from "@/lib/tenant-db";
import { formatDateTime, formatWeekday, formatTime } from "@/lib/utils";

export interface SlotRequest {
  tenantId: string;
  durationMinutes: number;
  earliest?: Date;
  latest?: Date;
  requiredSkills?: string[];
  zip?: string;
  preferredDate?: Date | null;
  preferredDayPart?: "morning" | "afternoon" | "evening" | "any";
  priority?: Priority;
  limit?: number;
  /** Puffer für An- und Abfahrt in Minuten. */
  travelBufferMinutes?: number;
}

export interface Slot {
  id: string;
  employeeId: string;
  employeeName: string;
  start: Date;
  end: Date;
  score: number;
  reasons: string[];
}

const SLOT_GRANULARITY_MINUTES = 30;

function parseTime(value: string): { hours: number; minutes: number } {
  const [hours, minutes] = value.split(":").map(Number);
  return { hours: hours || 0, minutes: minutes || 0 };
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function dayPartOf(date: Date): "morning" | "afternoon" | "evening" {
  const hour = date.getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/**
 * Findet freie Termine (§13, §14).
 * Berücksichtigt Arbeitszeiten, Urlaub, bestehende Termine, Dauer, Qualifikation,
 * Region, Priorität und einen Fahrtzeitpuffer.
 */
export async function findAvailableSlots(request: SlotRequest): Promise<Slot[]> {
  const db = tenantDb(request.tenantId);
  const now = new Date();
  const urgent = request.priority === "URGENT";
  const high = request.priority === "HIGH";

  const earliest = request.earliest ?? new Date(now.getTime() + (urgent ? 60 : 18 * 60) * 60 * 1000);
  const latest = request.latest ?? new Date(earliest.getTime() + 21 * 24 * 60 * 60 * 1000);
  const travelBuffer = request.travelBufferMinutes ?? 30;
  const limit = request.limit ?? 5;

  const [businessHours, employees, absences, appointments] = await Promise.all([
    db.businessHour.findMany(),
    db.employee.findMany({ where: { isActive: true, isTechnician: true } }),
    db.absence.findMany({ where: { end: { gte: earliest }, start: { lte: latest } } }),
    db.appointment.findMany({
      where: { start: { lte: latest }, end: { gte: earliest }, status: { in: ["PROPOSED", "CONFIRMED"] } },
    }),
  ]);

  if (!employees.length) return [];

  const hoursByWeekday = new Map(businessHours.map((entry) => [entry.weekday, entry]));
  const requiredSkills = (request.requiredSkills ?? []).filter(Boolean);

  const candidates = employees
    .map((employee) => {
      const matchedSkills = requiredSkills.filter((skill) => employee.skills.includes(skill));
      const skillScore = requiredSkills.length ? matchedSkills.length / requiredSkills.length : 1;
      const regionMatch =
        !request.zip || !employee.regions.length
          ? null
          : employee.regions.some((region) => request.zip!.startsWith(region));
      return { employee, skillScore, regionMatch };
    })
    // Ohne passende Qualifikation wird nicht geplant, sofern Qualifikationen gefordert sind.
    .filter((candidate) => (requiredSkills.length ? candidate.skillScore > 0 : true));

  if (!candidates.length) return [];

  const slots: Slot[] = [];
  const cursorDay = new Date(earliest);
  cursorDay.setHours(0, 0, 0, 0);

  while (cursorDay <= latest && slots.length < limit * 20) {
    const weekday = cursorDay.getDay();
    const hours = hoursByWeekday.get(weekday);

    if (hours && !hours.isClosed) {
      const { hours: startH, minutes: startM } = parseTime(hours.startTime);
      const { hours: endH, minutes: endM } = parseTime(hours.endTime);

      for (const candidate of candidates) {
        // Pro Mitarbeiter und Tag höchstens ein Vorschlag je Tageszeit, damit auch
        // Nachmittagswünsche eine Chance bekommen.
        const takenDayParts = new Set<string>();
        const dayStart = new Date(cursorDay);
        dayStart.setHours(startH, startM, 0, 0);
        const dayEnd = new Date(cursorDay);
        dayEnd.setHours(endH, endM, 0, 0);

        for (
          let start = new Date(Math.max(dayStart.getTime(), earliest.getTime()));
          start.getTime() + request.durationMinutes * 60_000 <= dayEnd.getTime();
          start = new Date(start.getTime() + SLOT_GRANULARITY_MINUTES * 60_000)
        ) {
          // Auf ein sauberes Raster ausrichten.
          if (start.getMinutes() % SLOT_GRANULARITY_MINUTES !== 0) {
            start.setMinutes(Math.ceil(start.getMinutes() / SLOT_GRANULARITY_MINUTES) * SLOT_GRANULARITY_MINUTES, 0, 0);
            continue;
          }
          const end = new Date(start.getTime() + request.durationMinutes * 60_000);
          if (end > latest) break;

          if (takenDayParts.has(dayPartOf(start))) continue;

          const blockedByAbsence = absences.some(
            (absence) => absence.employeeId === candidate.employee.id && overlaps(start, end, absence.start, absence.end),
          );
          if (blockedByAbsence) continue;

          const blockedByAppointment = appointments.some(
            (appointment) =>
              appointment.employeeId === candidate.employee.id &&
              overlaps(
                new Date(start.getTime() - travelBuffer * 60_000),
                new Date(end.getTime() + travelBuffer * 60_000),
                appointment.start,
                appointment.end,
              ),
          );
          if (blockedByAppointment) continue;

          const reasons: string[] = [];
          let score = 50;

          // Je früher, desto besser – bei dringenden Fällen stärker gewichtet.
          const hoursAhead = (start.getTime() - now.getTime()) / 3_600_000;
          const urgencyWeight = urgent ? 2.5 : high ? 1.4 : 0.6;
          score -= Math.min(hoursAhead * urgencyWeight * 0.08, 40);

          if (request.preferredDate) {
            const sameDay = start.toDateString() === request.preferredDate.toDateString();
            if (sameDay) {
              score += 25;
              reasons.push("entspricht dem Wunschtag");
            } else if (start < request.preferredDate) {
              score -= 8;
            }
          }

          if (request.preferredDayPart && request.preferredDayPart !== "any") {
            if (dayPartOf(start) === request.preferredDayPart) {
              score += 12;
              reasons.push("passt zur gewünschten Tageszeit");
            } else {
              score -= 6;
            }
          }

          if (requiredSkills.length) {
            score += candidate.skillScore * 15;
            if (candidate.skillScore === 1) reasons.push("Qualifikation passt vollständig");
          }

          if (candidate.regionMatch === true) {
            score += 10;
            reasons.push("Einsatzgebiet passt");
          } else if (candidate.regionMatch === false) {
            score -= 5;
          }

          takenDayParts.add(dayPartOf(start));
          slots.push({
            id: `${candidate.employee.id}:${start.toISOString()}`,
            employeeId: candidate.employee.id,
            employeeName: `${candidate.employee.firstName} ${candidate.employee.lastName}`,
            start,
            end,
            score: Math.round(score * 10) / 10,
            reasons,
          });
        }
      }
    }

    cursorDay.setDate(cursorDay.getDate() + 1);
  }

  return slots.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function describeSlot(slot: { start: Date; end: Date; employeeName?: string }): string {
  return `${formatWeekday(slot.start)}, ${formatTime(slot.start)}–${formatTime(slot.end)} Uhr${
    slot.employeeName ? ` bei ${slot.employeeName}` : ""
  }`;
}

export function describeSlotShort(slot: { start: Date; employeeName?: string }): string {
  return `${formatDateTime(slot.start)} Uhr${slot.employeeName ? ` (${slot.employeeName})` : ""}`;
}

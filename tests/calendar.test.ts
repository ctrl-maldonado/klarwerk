import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { findAvailableSlots } from "@/modules/calendar/scheduling";
import { createTestEmployee, createTestTenant, dropTenant } from "./helpers";

describe("Terminfindung", () => {
  let tenantId: string;
  let heatingEmployeeId: string;
  let cleaningEmployeeId: string;

  beforeAll(async () => {
    const setup = await createTestTenant();
    tenantId = setup.tenant.id;
    heatingEmployeeId = (await createTestEmployee(tenantId, ["heizung"])).id;
    cleaningEmployeeId = (await createTestEmployee(tenantId, ["reinigung"])).id;
  });

  afterAll(async () => {
    await dropTenant(tenantId);
  });

  it("schlägt nur Termine innerhalb der Arbeitszeiten vor", async () => {
    const slots = await findAvailableSlots({ tenantId, durationMinutes: 60, limit: 20 });
    expect(slots.length).toBeGreaterThan(0);

    for (const slot of slots) {
      const weekday = slot.start.getDay();
      expect(weekday).not.toBe(0);
      expect(weekday).not.toBe(6);
      expect(slot.start.getHours()).toBeGreaterThanOrEqual(8);
      expect(slot.end.getHours()).toBeLessThanOrEqual(17);
    }
  });

  it("berücksichtigt die geforderte Qualifikation", async () => {
    const slots = await findAvailableSlots({ tenantId, durationMinutes: 60, requiredSkills: ["heizung"], limit: 10 });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((slot) => slot.employeeId === heatingEmployeeId)).toBe(true);
  });

  it("liefert nichts, wenn niemand die Qualifikation hat", async () => {
    const slots = await findAvailableSlots({ tenantId, durationMinutes: 60, requiredSkills: ["dachdecker"], limit: 5 });
    expect(slots).toHaveLength(0);
  });

  it("überspringt belegte Zeiten samt Fahrtzeitpuffer", async () => {
    const first = (await findAvailableSlots({ tenantId, durationMinutes: 60, requiredSkills: ["heizung"], limit: 1 }))[0];

    await prisma.appointment.create({
      data: {
        tenantId,
        employeeId: heatingEmployeeId,
        title: "Belegt",
        start: first.start,
        end: first.end,
        status: "CONFIRMED",
      },
    });

    const after = await findAvailableSlots({ tenantId, durationMinutes: 60, requiredSkills: ["heizung"], limit: 5 });
    for (const slot of after) {
      const overlapsWithBuffer =
        slot.start < new Date(first.end.getTime() + 30 * 60_000) &&
        slot.end > new Date(first.start.getTime() - 30 * 60_000);
      expect(overlapsWithBuffer).toBe(false);
    }
  });

  it("überspringt Urlaubszeiten", async () => {
    const from = new Date();
    from.setDate(from.getDate() + 1);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 14);

    await prisma.absence.create({
      data: { tenantId, employeeId: cleaningEmployeeId, start: from, end: to, reason: "Urlaub" },
    });

    const slots = await findAvailableSlots({ tenantId, durationMinutes: 60, requiredSkills: ["reinigung"], earliest: from, latest: to, limit: 5 });
    expect(slots).toHaveLength(0);
  });

  it("bevorzugt den Wunschtag und die gewünschte Tageszeit", async () => {
    const preferred = new Date();
    preferred.setDate(preferred.getDate() + 7);
    while (preferred.getDay() === 0 || preferred.getDay() === 6) preferred.setDate(preferred.getDate() + 1);
    preferred.setHours(0, 0, 0, 0);

    const slots = await findAvailableSlots({
      tenantId,
      durationMinutes: 60,
      requiredSkills: ["heizung"],
      preferredDate: preferred,
      preferredDayPart: "afternoon",
      limit: 3,
    });

    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].start.toDateString()).toBe(preferred.toDateString());
    expect(slots[0].start.getHours()).toBeGreaterThanOrEqual(12);
    expect(slots[0].reasons.join(" ")).toContain("Wunschtag");
  });

  it("plant dringende Fälle früher ein als normale", async () => {
    const urgent = await findAvailableSlots({ tenantId, durationMinutes: 60, priority: "URGENT", limit: 1 });
    const normal = await findAvailableSlots({ tenantId, durationMinutes: 60, priority: "NORMAL", limit: 1 });
    expect(urgent[0].start.getTime()).toBeLessThanOrEqual(normal[0].start.getTime());
  });
});

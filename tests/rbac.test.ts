import { describe, expect, it } from "vitest";
import { SYSTEM_ROLES, assertPermission, expandPermissions, grantsPermission, hasPermission } from "@/lib/rbac";
import { ForbiddenError } from "@/lib/errors";

describe("Berechtigungen", () => {
  const owner = SYSTEM_ROLES.find((role) => role.key === "owner")!;
  const technician = SYSTEM_ROLES.find((role) => role.key === "technician")!;
  const officeManager = SYSTEM_ROLES.find((role) => role.key === "office_manager")!;

  it("gibt dem Inhaber alle Rechte", () => {
    expect(grantsPermission(owner.permissions, "emails:send")).toBe(true);
    expect(grantsPermission(owner.permissions, "settings:write")).toBe(true);
  });

  it("löst Bereichs-Platzhalter auf", () => {
    expect(grantsPermission(["customers:*"], "customers:delete")).toBe(true);
    expect(grantsPermission(["customers:*"], "orders:read")).toBe(false);
  });

  it("beschränkt Techniker auf lesenden Zugriff", () => {
    expect(hasPermission(technician.permissions, "orders:read")).toBe(true);
    expect(hasPermission(technician.permissions, "orders:write")).toBe(false);
    expect(hasPermission(technician.permissions, "emails:send")).toBe(false);
    expect(hasPermission(technician.permissions, "ai:approve")).toBe(false);
  });

  it("erlaubt der Büroleitung Freigaben, aber keine Benutzerverwaltung", () => {
    expect(hasPermission(officeManager.permissions, "ai:approve")).toBe(true);
    expect(hasPermission(officeManager.permissions, "emails:send")).toBe(true);
    expect(hasPermission(officeManager.permissions, "users:write")).toBe(false);
  });

  it("wirft bei fehlender Berechtigung", () => {
    expect(() => assertPermission(technician.permissions, "emails:send")).toThrow(ForbiddenError);
  });

  it("expandiert Platzhalter für die Anzeige", () => {
    const expanded = expandPermissions(owner.permissions);
    expect(expanded).toContain("emails:send");
    expect(expanded.length).toBeGreaterThan(20);
  });
});

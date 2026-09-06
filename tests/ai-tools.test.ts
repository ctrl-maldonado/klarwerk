import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { tenantDb } from "@/lib/tenant-db";
import { ForbiddenError } from "@/lib/errors";
import { approvalRequiredFor, availableToolSchemas, executeAction, type ToolContext } from "@/modules/ai/tools";
import { createTestTenant, dropTenant } from "./helpers";

describe("AI-Werkzeuge", () => {
  let tenantId: string;
  let ownerContext: ToolContext;
  let technicianContext: ToolContext;

  beforeAll(async () => {
    const setup = await createTestTenant();
    tenantId = setup.tenant.id;

    ownerContext = {
      tenantId,
      actor: { type: "AI", userId: setup.owner.id, label: "Test" },
      permissions: setup.ownerPermissions,
    };
    technicianContext = {
      tenantId,
      actor: { type: "AI", userId: setup.technician.id, label: "Test Techniker" },
      permissions: setup.technicianPermissions,
    };
  });

  afterAll(async () => {
    await dropTenant(tenantId);
  });

  it("führt lesende Werkzeuge ohne Freigabe aus", async () => {
    const result = await executeAction("search_customer", { query: "gibt es nicht" }, ownerContext, "auto");
    expect(result.staged).toBeUndefined();
    expect(result.summary).toContain("Kein passender Kunde");
  });

  it("merkt Aktionen mit mittlerem Risiko zur Freigabe vor statt sie auszuführen", async () => {
    const result = await executeAction(
      "create_customer",
      { firstName: "Vorgemerkt", lastName: "Test" },
      ownerContext,
      "auto",
    );
    expect(result.staged).toBe(true);

    const customers = await tenantDb(tenantId).customer.findMany({ where: { firstName: "Vorgemerkt" } });
    expect(customers).toHaveLength(0);
  });

  it("führt dieselbe Aktion nach erteilter Freigabe aus und protokolliert sie", async () => {
    const result = await executeAction(
      "create_customer",
      { firstName: "Freigegeben", lastName: "Test", email: "freigegeben@test.local" },
      ownerContext,
      "execute",
    );
    expect(result.entityType).toBe("customer");

    const audit = await prisma.auditLog.findFirst({
      where: { tenantId, action: "create_customer", entityId: result.entityId },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorType).toBe("AI");
  });

  it("verweigert Werkzeuge, für die dem Benutzer die Berechtigung fehlt", async () => {
    await expect(
      executeAction("create_order", { title: "Unerlaubt" }, technicianContext, "execute"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("bietet der AI nur Werkzeuge an, die die Rolle abdeckt", async () => {
    const ownerTools = await availableToolSchemas(tenantId, ownerContext.permissions);
    const technicianTools = await availableToolSchemas(tenantId, technicianContext.permissions);

    expect(ownerTools.map((tool) => tool.name)).toContain("send_email");
    expect(technicianTools.map((tool) => tool.name)).not.toContain("send_email");
    expect(technicianTools.map((tool) => tool.name)).toContain("search_orders");
  });

  it("berücksichtigt deaktivierte Aktionen", async () => {
    await tenantDb(tenantId).aIAction.updateMany({ where: { key: "create_task" }, data: { isEnabled: false } });
    await expect(executeAction("create_task", { title: "Test" }, ownerContext, "execute")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await tenantDb(tenantId).aIAction.updateMany({ where: { key: "create_task" }, data: { isEnabled: true } });
  });

  it("verlangt im sicheren Modus für jedes Risiko oberhalb gering eine Freigabe", async () => {
    expect(await approvalRequiredFor(tenantId, "LOW")).toBe(false);
    expect(await approvalRequiredFor(tenantId, "MEDIUM")).toBe(true);
    expect(await approvalRequiredFor(tenantId, "HIGH")).toBe(true);
  });

  it("lässt mittleres Risiko im automatischen Modus ohne Freigabe zu, hohes aber nicht", async () => {
    await prisma.tenant.update({ where: { id: tenantId }, data: { automationLevel: "AUTOMATIC" } });
    await prisma.tenantSettings.update({
      where: { tenantId },
      data: { approvalPolicy: { LOW: "auto", MEDIUM: "auto", HIGH: "approve" } },
    });

    expect(await approvalRequiredFor(tenantId, "MEDIUM")).toBe(false);
    expect(await approvalRequiredFor(tenantId, "HIGH")).toBe(true);

    await prisma.tenant.update({ where: { id: tenantId }, data: { automationLevel: "SAFE" } });
    await prisma.tenantSettings.update({
      where: { tenantId },
      data: { approvalPolicy: { LOW: "auto", MEDIUM: "approve", HIGH: "approve" } },
    });
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { tenantDb } from "@/lib/tenant-db";
import { deleteCustomer, exportTenantData, applyRetention } from "@/modules/privacy/service";
import { createTestTenant, dropTenant } from "./helpers";

describe("Datenschutz", () => {
  let tenantId: string;
  let ownerId: string;
  let customerId: string;

  beforeAll(async () => {
    const setup = await createTestTenant();
    tenantId = setup.tenant.id;
    ownerId = setup.owner.id;

    const db = tenantDb(tenantId);
    const customer = await db.customer.create({
      data: {
        tenantId,
        customerNumber: "K-DS-1",
        firstName: "Petra",
        lastName: "Person",
        email: "petra@example.de",
        street: "Datenweg 1",
      },
    });
    customerId = customer.id;

    const status = await db.orderStatus.findFirstOrThrow({ where: { key: "new" } });
    await db.order.create({
      data: {
        tenantId,
        orderNumber: "A-DS-1",
        customerId: customer.id,
        title: "Auftrag mit Personenbezug",
        description: "Enthält den Namen Petra Person.",
        statusId: status.id,
      },
    });
    await db.email.create({
      data: {
        tenantId,
        externalId: "ds-1",
        direction: "INBOUND",
        fromEmail: "petra@example.de",
        toEmails: [],
        ccEmails: [],
        subject: "Persönliche Nachricht",
        bodyText: "Vertraulicher Inhalt",
        customerId: customer.id,
        status: "HANDLED",
        receivedAt: new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000),
      },
    });
  });

  afterAll(async () => {
    await dropTenant(tenantId);
  });

  it("exportiert alle Daten des Betriebs", async () => {
    const exported = await exportTenantData(tenantId, { userId: ownerId, label: "Test Inhaber" });
    expect(exported.format).toBe("klarwerk-export-v1");
    expect(exported.customers).toHaveLength(1);
    expect(exported.orders).toHaveLength(1);
    expect(exported.emails).toHaveLength(1);

    const audit = await prisma.auditLog.findFirst({ where: { tenantId, action: "data_exported" } });
    expect(audit).not.toBeNull();
  });

  it("setzt Aufbewahrungsfristen durch", async () => {
    const result = await applyRetention(tenantId);
    expect(result.emailsDeleted).toBe(1);
    expect(await tenantDb(tenantId).email.count()).toBe(0);
  });

  it("löscht personenbezogene Daten und anonymisiert den Vorgang", async () => {
    await deleteCustomer(tenantId, customerId, { userId: ownerId, label: "Test Inhaber" });

    expect(await tenantDb(tenantId).customer.count()).toBe(0);
    const order = await tenantDb(tenantId).order.findFirstOrThrow({});
    expect(order.customerId).toBeNull();
    expect(order.description).toBe("[Kundendaten gelöscht]");
  });

  it("behält das Protokoll auch nach der Löschung", async () => {
    const audit = await prisma.auditLog.findFirst({ where: { tenantId, action: "customer_deleted" } });
    expect(audit).not.toBeNull();
    expect(audit?.entityId).toBe(customerId);
  });
});

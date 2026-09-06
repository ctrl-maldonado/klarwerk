import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { tenantDb } from "@/lib/tenant-db";
import { TenantIsolationError } from "@/lib/errors";
import { createTestTenant, dropTenant } from "./helpers";

describe("Mandantentrennung", () => {
  let tenantA: string;
  let tenantB: string;
  let customerBId: string;

  beforeAll(async () => {
    const a = await createTestTenant({ name: "Betrieb A" });
    const b = await createTestTenant({ name: "Betrieb B" });
    tenantA = a.tenant.id;
    tenantB = b.tenant.id;

    await tenantDb(tenantA).customer.create({
      data: { tenantId: tenantA, customerNumber: "K-A-1", firstName: "Anna", lastName: "Alpha" },
    });
    const customerB = await tenantDb(tenantB).customer.create({
      data: { tenantId: tenantB, customerNumber: "K-B-1", firstName: "Bert", lastName: "Beta" },
    });
    customerBId = customerB.id;
  });

  afterAll(async () => {
    await dropTenant(tenantA);
    await dropTenant(tenantB);
  });

  it("liefert nur Datensätze des eigenen Mandanten", async () => {
    const customers = await tenantDb(tenantA).customer.findMany();
    expect(customers).toHaveLength(1);
    expect(customers[0].lastName).toBe("Alpha");
  });

  it("findet fremde Datensätze auch bei direkter ID-Suche nicht", async () => {
    const found = await tenantDb(tenantA).customer.findFirst({ where: { id: customerBId } });
    expect(found).toBeNull();
  });

  it("blockiert findUnique auf einen fremden Datensatz", async () => {
    await expect(tenantDb(tenantA).customer.findUnique({ where: { id: customerBId } })).rejects.toBeInstanceOf(
      TenantIsolationError,
    );
  });

  it("weist Abfragen mit fremder tenantId ab", () => {
    expect(() => tenantDb(tenantA).customer.findMany({ where: { tenantId: tenantB } })).toThrow(TenantIsolationError);
  });

  it("weist Schreibvorgänge mit fremder tenantId ab", () => {
    expect(() =>
      tenantDb(tenantA).customer.create({
        data: { tenantId: tenantB, customerNumber: "K-X-1", firstName: "Falsch", lastName: "Zugeordnet" },
      }),
    ).toThrow(TenantIsolationError);
  });

  it("ändert keine fremden Datensätze", async () => {
    const result = await tenantDb(tenantA).customer.updateMany({
      where: { id: customerBId },
      data: { lastName: "Manipuliert" },
    });
    expect(result.count).toBe(0);

    const untouched = await prisma.customer.findUniqueOrThrow({ where: { id: customerBId } });
    expect(untouched.lastName).toBe("Beta");
  });

  it("löscht keine fremden Datensätze", async () => {
    const result = await tenantDb(tenantA).customer.deleteMany({ where: { id: customerBId } });
    expect(result.count).toBe(0);
  });
});

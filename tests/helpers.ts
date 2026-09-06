import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { createTenant } from "@/modules/tenants/provisioning";
import { syncSystemPrompts } from "@/modules/ai/prompt-store";
import { hashPassword } from "@/modules/auth/password";

let promptsSynced = false;

export async function createTestTenant(options: { industryKey?: string; name?: string } = {}) {
  if (!promptsSynced) {
    await syncSystemPrompts();
    promptsSynced = true;
  }

  const tenant = await createTenant({
    name: options.name ?? `Testbetrieb ${randomUUID().slice(0, 8)}`,
    industryKey: options.industryKey ?? "plumbing_heating",
  });

  const ownerRole = await prisma.role.findFirstOrThrow({ where: { tenantId: tenant.id, key: "owner" } });
  const technicianRole = await prisma.role.findFirstOrThrow({ where: { tenantId: tenant.id, key: "technician" } });

  const owner = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: `owner-${randomUUID().slice(0, 8)}@test.local`,
      name: "Test Inhaber",
      passwordHash: await hashPassword("Testpasswort1"),
      roleId: ownerRole.id,
    },
  });

  const technician = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: `tech-${randomUUID().slice(0, 8)}@test.local`,
      name: "Test Techniker",
      passwordHash: await hashPassword("Testpasswort1"),
      roleId: technicianRole.id,
    },
  });

  return { tenant, owner, technician, ownerPermissions: ownerRole.permissions, technicianPermissions: technicianRole.permissions };
}

export async function createTestEmployee(tenantId: string, skills: string[] = ["heizung", "sanitaer"]) {
  return prisma.employee.create({
    data: {
      tenantId,
      firstName: "Test",
      lastName: "Monteur",
      skills,
      regions: ["40"],
      isTechnician: true,
    },
  });
}

export async function dropTenant(tenantId: string) {
  await prisma.auditLog.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
}

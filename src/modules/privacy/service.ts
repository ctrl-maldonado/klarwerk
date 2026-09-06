import { prisma } from "@/lib/db";
import { tenantDb } from "@/lib/tenant-db";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/modules/audit";

/**
 * DSGVO-Funktionen (§30).
 * Export, Löschung und Aufbewahrungsfristen. Audit-Einträge bleiben erhalten,
 * werden bei Personenlöschung aber pseudonymisiert.
 */

export async function exportTenantData(tenantId: string, actor: { userId: string; label: string }) {
  const db = tenantDb(tenantId);
  const [tenant, users, employees, customers, orders, appointments, emails, documents, tasks, auditLogs] =
    await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, include: { settings: true, subscription: true } }),
      db.user.findMany({ select: { id: true, email: true, name: true, createdAt: true, lastLoginAt: true } }),
      db.employee.findMany(),
      db.customer.findMany({ include: { contacts: true } }),
      db.order.findMany({ include: { status: true } }),
      db.appointment.findMany(),
      db.email.findMany({ include: { attachments: true } }),
      db.document.findMany({ select: { id: true, filename: true, mimeType: true, size: true, createdAt: true } }),
      db.task.findMany(),
      db.auditLog.findMany({ orderBy: { at: "desc" }, take: 5000 }),
    ]);

  await writeAudit({
    tenantId,
    actorType: "USER",
    actorUserId: actor.userId,
    actorLabel: actor.label,
    action: "data_exported",
    entityType: "tenant",
    entityId: tenantId,
    details: { customers: customers.length, orders: orders.length, emails: emails.length },
  });

  return {
    exportedAt: new Date().toISOString(),
    format: "klarwerk-export-v1",
    tenant,
    users,
    employees,
    customers,
    orders,
    appointments,
    emails,
    documents,
    tasks,
    auditLogs,
  };
}

export async function exportCustomerData(tenantId: string, customerId: string) {
  const db = tenantDb(tenantId);
  const customer = await db.customer.findFirst({
    where: { id: customerId },
    include: { contacts: true, orders: true, appointments: true, emails: true, documents: true, tasks: true },
  });
  if (!customer) throw new AppError("Kunde nicht gefunden.", 404, "not_found");
  return { exportedAt: new Date().toISOString(), format: "klarwerk-customer-export-v1", customer };
}

/**
 * Löscht einen Kunden samt personenbezogener Inhalte.
 * Aufträge bleiben als anonymisierte Vorgänge bestehen, damit betriebliche
 * Aufzeichnungs- und Aufbewahrungspflichten erfüllbar bleiben.
 */
export async function deleteCustomer(
  tenantId: string,
  customerId: string,
  actor: { userId: string; label: string },
): Promise<void> {
  const db = tenantDb(tenantId);
  const customer = await db.customer.findFirst({ where: { id: customerId } });
  if (!customer) throw new AppError("Kunde nicht gefunden.", 404, "not_found");

  await db.email.updateMany({
    where: { customerId },
    data: { bodyText: "[gelöscht]", bodyHtml: null, subject: "[gelöscht]", fromName: "", customerId: null },
  });
  await db.document.deleteMany({ where: { customerId } });
  await db.order.updateMany({ where: { customerId }, data: { customerId: null, description: "[Kundendaten gelöscht]" } });
  await db.customerContact.deleteMany({ where: { customerId } });
  await db.customer.delete({ where: { id: customerId } });

  await writeAudit({
    tenantId,
    actorType: "USER",
    actorUserId: actor.userId,
    actorLabel: actor.label,
    action: "customer_deleted",
    entityType: "customer",
    entityId: customerId,
    details: { customerNumber: customer.customerNumber },
  });
}

/** Setzt Aufbewahrungsfristen durch. Wird vom Hintergrundprozess aufgerufen. */
export async function applyRetention(tenantId: string): Promise<{ emailsDeleted: number }> {
  const settings = await prisma.tenantSettings.findUnique({ where: { tenantId } });
  if (!settings) return { emailsDeleted: 0 };

  const cutoff = new Date(Date.now() - settings.retentionDaysEmails * 24 * 60 * 60 * 1000);
  const result = await tenantDb(tenantId).email.deleteMany({
    where: { receivedAt: { lt: cutoff }, status: { in: ["PROCESSED", "HANDLED", "SENT"] } },
  });

  if (result.count) {
    await writeAudit({
      tenantId,
      actorType: "SYSTEM",
      actorLabel: "Aufbewahrungsfrist",
      action: "retention_applied",
      entityType: "email",
      details: { deleted: result.count, olderThan: cutoff.toISOString() },
    });
  }
  return { emailsDeleted: result.count };
}

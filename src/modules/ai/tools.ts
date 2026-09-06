import type { ActorType, AppointmentStatus, Priority, RiskLevel } from "@prisma/client";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { grantsPermission } from "@/lib/rbac";
import { tenantDb } from "@/lib/tenant-db";
import { formatDateTime, truncate } from "@/lib/utils";
import { writeAudit } from "@/modules/audit";
import { findAvailableSlots, describeSlot } from "@/modules/calendar/scheduling";
import { customerDisplayName, findMatchingCustomers, nextCustomerNumber, searchCustomers } from "@/modules/customers/service";
import { sendDraft } from "@/modules/email/service";
import { defaultOrderStatusId, nextOrderNumber, PRIORITY_LABELS } from "@/modules/orders/service";
import { AI_ACTIONS, getActionDefinition } from "./action-catalog";
import type { AIToolSchema } from "./providers/types";

export interface ToolActor {
  type: ActorType;
  userId?: string | null;
  label: string;
}

export interface ToolContext {
  tenantId: string;
  actor: ToolActor;
  /** Berechtigungen des auslösenden Benutzers – die AI erbt sie, mehr nie (§18). */
  permissions: string[];
  aiExecutionId?: string | null;
  approvalRequestId?: string | null;
  workflowRunId?: string | null;
  ip?: string | null;
}

export interface ToolResult {
  actionKey: string;
  summary: string;
  data: unknown;
  entityType?: string;
  entityId?: string;
}

type Handler = (args: Record<string, any>, context: ToolContext) => Promise<ToolResult>;

/** Freigabepolitik des Mandanten für eine Risikostufe (§17). */
export async function approvalRequiredFor(tenantId: string, riskLevel: RiskLevel): Promise<boolean> {
  const db = tenantDb(tenantId);
  const [settings, tenant] = await Promise.all([
    db.raw.tenantSettings.findUnique({ where: { tenantId } }),
    db.raw.tenant.findUnique({ where: { id: tenantId } }),
  ]);

  const policy = (settings?.approvalPolicy as Record<string, string> | undefined) ?? {};
  const mode = policy[riskLevel] ?? (riskLevel === "LOW" ? "auto" : "approve");

  // Automatisierungsgrad des Betriebs (§7) begrenzt die Politik zusätzlich.
  if (tenant?.automationLevel === "SAFE" && riskLevel !== "LOW") return true;
  if (tenant?.automationLevel === "ASSISTED" && riskLevel === "HIGH") return true;

  return mode !== "auto";
}

export async function assertActionAllowed(
  tenantId: string,
  actionKey: string,
  permissions: string[],
): Promise<{ riskLevel: RiskLevel; readOnly: boolean }> {
  const definition = getActionDefinition(actionKey);
  if (!definition) throw new AppError(`Unbekannte Aktion: ${actionKey}`, 400, "unknown_action");

  const record = await tenantDb(tenantId).aIAction.findFirst({ where: { key: actionKey } });
  if (record && !record.isEnabled) {
    throw new ForbiddenError(`Die Aktion „${definition.name}" ist für diesen Betrieb deaktiviert.`);
  }

  const requiredPermission = record?.requiredPermission || definition.requiredPermission;
  if (requiredPermission && !grantsPermission(permissions, requiredPermission)) {
    throw new ForbiddenError(
      `Für „${definition.name}" fehlt die Berechtigung ${requiredPermission}.`,
    );
  }

  return { riskLevel: record?.riskLevel ?? definition.riskLevel, readOnly: Boolean(definition.readOnly) };
}

/**
 * Führt eine AI-Aktion aus (§18).
 *
 * mode "auto"    – respektiert die Freigabepolitik: riskante Aktionen werden nur
 *                  vorgeschlagen und zurückgegeben, nicht ausgeführt.
 * mode "execute" – führt aus (nach erteilter Freigabe oder durch einen Menschen).
 */
export async function executeAction(
  actionKey: string,
  args: Record<string, unknown>,
  context: ToolContext,
  mode: "auto" | "execute" = "execute",
): Promise<ToolResult & { staged?: boolean }> {
  const { riskLevel, readOnly } = await assertActionAllowed(context.tenantId, actionKey, context.permissions);

  if (mode === "auto" && !readOnly && (await approvalRequiredFor(context.tenantId, riskLevel))) {
    const definition = getActionDefinition(actionKey)!;
    return {
      actionKey,
      staged: true,
      summary: `${definition.name} – zur Freigabe vorgemerkt.`,
      data: { args },
    };
  }

  const handler = HANDLERS[actionKey];
  if (!handler) throw new AppError(`Für die Aktion „${actionKey}" ist keine Umsetzung hinterlegt.`, 500, "unknown_action");

  try {
    const result = await handler(args as Record<string, any>, context);
    if (!readOnly) {
      await writeAudit({
        tenantId: context.tenantId,
        actorType: context.actor.type,
        actorUserId: context.actor.userId ?? null,
        actorLabel: context.actor.label,
        action: actionKey,
        entityType: result.entityType,
        entityId: result.entityId,
        result: "success",
        details: { args, summary: result.summary },
        aiExecutionId: context.aiExecutionId ?? null,
        approvalRequestId: context.approvalRequestId ?? null,
        ip: context.ip ?? null,
      });
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeAudit({
      tenantId: context.tenantId,
      actorType: context.actor.type,
      actorUserId: context.actor.userId ?? null,
      actorLabel: context.actor.label,
      action: actionKey,
      result: "failed",
      details: { args, error: message },
      aiExecutionId: context.aiExecutionId ?? null,
      approvalRequestId: context.approvalRequestId ?? null,
    });
    throw error;
  }
}

/** Tool-Schemata, die ein Benutzer der AI zur Verfügung stellen darf. */
export async function availableToolSchemas(
  tenantId: string,
  permissions: string[],
  options: { readOnlyOnly?: boolean } = {},
): Promise<AIToolSchema[]> {
  const records = await tenantDb(tenantId).aIAction.findMany({ where: { isEnabled: true } });
  const enabledKeys = new Set(records.map((record) => record.key));

  return AI_ACTIONS.filter((action) => {
    if (records.length && !enabledKeys.has(action.key)) return false;
    if (options.readOnlyOnly && !action.readOnly) return false;
    return grantsPermission(permissions, action.requiredPermission);
  }).map((action) => ({
    name: action.key,
    description: action.description,
    parameters: action.parameters,
  }));
}

// ───────────────────────────── Umsetzungen ─────────────────────────────

const HANDLERS: Record<string, Handler> = {
  async search_customer(args, context) {
    const matches = await findMatchingCustomers(context.tenantId, {
      name: args.query,
      email: args.email,
      phone: args.phone,
    });
    const fallback = matches.length ? [] : await searchCustomers(context.tenantId, args.query ?? "", 5);
    const data = matches.length
      ? matches.map((match) => ({
          id: match.customer.id,
          name: customerDisplayName(match.customer),
          customerNumber: match.customer.customerNumber,
          email: match.customer.email,
          phone: match.customer.phone,
          address: [match.customer.street, `${match.customer.zip ?? ""} ${match.customer.city ?? ""}`.trim()].filter(Boolean).join(", "),
          confidence: match.confidence,
          reasons: match.reasons,
        }))
      : fallback.map((customer) => ({
          id: customer.id,
          name: customerDisplayName(customer),
          customerNumber: customer.customerNumber,
          email: customer.email,
          phone: customer.phone,
          confidence: 0.3,
          reasons: ["Textsuche"],
        }));

    return {
      actionKey: "search_customer",
      summary: data.length ? `${data.length} mögliche Treffer gefunden.` : "Kein passender Kunde gefunden.",
      data,
    };
  },

  async create_customer(args, context) {
    const db = tenantDb(context.tenantId);
    const customer = await db.customer.create({
      data: {
        tenantId: context.tenantId,
        customerNumber: await nextCustomerNumber(context.tenantId),
        type: args.companyName ? "COMPANY" : "PERSON",
        companyName: args.companyName || null,
        firstName: args.firstName || null,
        lastName: args.lastName || null,
        email: args.email || null,
        phone: args.phone || null,
        street: args.street || null,
        zip: args.zip || null,
        city: args.city || null,
        source: context.actor.type === "AI" ? "ai" : "manual",
      },
    });
    return {
      actionKey: "create_customer",
      summary: `Kunde ${customerDisplayName(customer)} (${customer.customerNumber}) angelegt.`,
      data: customer,
      entityType: "customer",
      entityId: customer.id,
    };
  },

  async update_customer(args, context) {
    const db = tenantDb(context.tenantId);
    const existing = await db.customer.findFirst({ where: { id: args.customerId } });
    if (!existing) throw new NotFoundError("Kunde nicht gefunden.");

    const customer = await db.customer.update({
      where: { id: args.customerId },
      data: {
        email: args.email ?? existing.email,
        phone: args.phone ?? existing.phone,
        street: args.street ?? existing.street,
        zip: args.zip ?? existing.zip,
        city: args.city ?? existing.city,
        notes: args.notes ? `${existing.notes}\n${args.notes}`.trim() : existing.notes,
      },
    });
    return {
      actionKey: "update_customer",
      summary: `Stammdaten von ${customerDisplayName(customer)} aktualisiert.`,
      data: customer,
      entityType: "customer",
      entityId: customer.id,
    };
  },

  async search_orders(args, context) {
    const db = tenantDb(context.tenantId);
    const orders = await db.order.findMany({
      where: {
        deletedAt: null,
        ...(args.customerId ? { customerId: args.customerId } : {}),
        ...(args.priority ? { priority: args.priority as Priority } : {}),
        ...(args.statusKey ? { status: { key: args.statusKey } } : {}),
        ...(args.onlyOpen ? { status: { isTerminal: false } } : {}),
        ...(args.query
          ? {
              OR: [
                { title: { contains: args.query, mode: "insensitive" as const } },
                { description: { contains: args.query, mode: "insensitive" as const } },
                { orderNumber: { contains: args.query, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      include: { customer: true, status: true, technician: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    });

    return {
      actionKey: "search_orders",
      summary: `${orders.length} Aufträge gefunden.`,
      data: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        title: order.title,
        status: order.status.label,
        priority: PRIORITY_LABELS[order.priority],
        customer: order.customer ? customerDisplayName(order.customer) : null,
        technician: order.technician ? `${order.technician.firstName} ${order.technician.lastName}` : null,
        createdAt: order.createdAt.toISOString(),
      })),
    };
  },

  async create_order(args, context) {
    const db = tenantDb(context.tenantId);
    const order = await db.order.create({
      data: {
        tenantId: context.tenantId,
        orderNumber: await nextOrderNumber(context.tenantId),
        customerId: args.customerId || null,
        title: args.title,
        description: args.description ?? "",
        categoryKey: args.categoryKey ?? "other",
        priority: (args.priority as Priority) ?? "NORMAL",
        statusId: await defaultOrderStatusId(context.tenantId),
        street: args.street || null,
        zip: args.zip || null,
        city: args.city || null,
        aiSummary: args.aiSummary ?? null,
        aiConfidence: typeof args.confidence === "number" ? args.confidence : null,
        createdByAI: context.actor.type === "AI",
        sourceEmailId: args.sourceEmailId || null,
      },
    });
    return {
      actionKey: "create_order",
      summary: `Auftrag ${order.orderNumber} „${truncate(order.title, 60)}" angelegt (${PRIORITY_LABELS[order.priority]}).`,
      data: order,
      entityType: "order",
      entityId: order.id,
    };
  },

  async update_order(args, context) {
    const db = tenantDb(context.tenantId);
    const existing = await db.order.findFirst({ where: { id: args.orderId }, include: { status: true } });
    if (!existing) throw new NotFoundError("Auftrag nicht gefunden.");

    let statusId = existing.statusId;
    if (args.statusKey) {
      const status = await db.orderStatus.findFirst({ where: { key: args.statusKey } });
      if (!status) throw new AppError(`Unbekannter Status: ${args.statusKey}`);
      statusId = status.id;
    }

    const order = await db.order.update({
      where: { id: args.orderId },
      data: {
        statusId,
        priority: (args.priority as Priority) ?? existing.priority,
        technicianId: args.technicianId ?? existing.technicianId,
        description: args.note
          ? `${existing.description}\n\n[${formatDateTime(new Date())}] ${args.note}`.trim()
          : (args.description ?? existing.description),
      },
      include: { status: true },
    });

    return {
      actionKey: "update_order",
      summary: `Auftrag ${order.orderNumber} aktualisiert (Status: ${order.status.label}).`,
      data: order,
      entityType: "order",
      entityId: order.id,
    };
  },

  async search_calendar(args, context) {
    const slots = await findAvailableSlots({
      tenantId: context.tenantId,
      durationMinutes: Number(args.durationMinutes) || 60,
      earliest: args.earliest ? new Date(args.earliest) : undefined,
      latest: args.latest ? new Date(args.latest) : undefined,
      requiredSkills: args.requiredSkills,
      zip: args.zip,
      preferredDayPart: args.preferredDayPart,
      limit: Number(args.limit) || 5,
    });

    return {
      actionKey: "search_calendar",
      summary: slots.length ? `${slots.length} freie Termine gefunden.` : "Keine freien Termine im gesuchten Zeitraum.",
      data: slots.map((slot) => ({
        id: slot.id,
        employeeId: slot.employeeId,
        employeeName: slot.employeeName,
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        label: describeSlot(slot),
        score: slot.score,
        reasons: slot.reasons,
      })),
    };
  },

  async create_appointment(args, context) {
    const db = tenantDb(context.tenantId);
    const appointment = await db.appointment.create({
      data: {
        tenantId: context.tenantId,
        orderId: args.orderId || null,
        customerId: args.customerId || null,
        employeeId: args.employeeId || null,
        title: args.title ?? "Kundeneinsatz",
        start: new Date(args.start),
        end: new Date(args.end),
        status: "PROPOSED",
        location: args.location || null,
        createdByAI: context.actor.type === "AI",
      },
      include: { employee: true },
    });

    return {
      actionKey: "create_appointment",
      summary: `Terminvorschlag ${formatDateTime(appointment.start)} Uhr${
        appointment.employee ? ` bei ${appointment.employee.firstName} ${appointment.employee.lastName}` : ""
      }.`,
      data: appointment,
      entityType: "appointment",
      entityId: appointment.id,
    };
  },

  async update_appointment(args, context) {
    const db = tenantDb(context.tenantId);
    const existing = await db.appointment.findFirst({ where: { id: args.appointmentId } });
    if (!existing) throw new NotFoundError("Termin nicht gefunden.");

    const start = args.start ? new Date(args.start) : existing.start;
    if (Number.isNaN(start.getTime())) throw new AppError("Der Startzeitpunkt ist ungültig.", 400, "invalid_date");

    // Ohne ausdrückliches Ende bleibt die geplante Dauer erhalten – beim
    // Verschieben eines Termins ist das fast immer die Absicht.
    const end = args.end
      ? new Date(args.end)
      : new Date(start.getTime() + (existing.end.getTime() - existing.start.getTime()));
    if (Number.isNaN(end.getTime())) throw new AppError("Der Endzeitpunkt ist ungültig.", 400, "invalid_date");
    if (end <= start) throw new AppError("Das Ende muss nach dem Beginn liegen.", 400, "invalid_range");

    const employeeId = args.employeeId === undefined ? existing.employeeId : args.employeeId || null;
    const status = (args.status as AppointmentStatus | undefined) ?? existing.status;

    // Dieselbe Prüfung wie beim verbindlichen Buchen: zwei bestätigte Termine
    // derselben Person dürfen sich nicht überschneiden.
    if (status === "CONFIRMED" && employeeId) {
      const conflict = await db.appointment.findFirst({
        where: {
          id: { not: existing.id },
          employeeId,
          status: "CONFIRMED",
          start: { lt: end },
          end: { gt: start },
        },
      });
      if (conflict) {
        throw new AppError(
          `Überschneidung mit einem bereits bestätigten Termin am ${formatDateTime(conflict.start)} Uhr.`,
          409,
          "conflict",
        );
      }
    }

    const appointment = await db.appointment.update({
      where: { id: existing.id },
      data: { start, end, employeeId, status },
      include: { employee: true },
    });

    const moved = start.getTime() !== existing.start.getTime();
    return {
      actionKey: "update_appointment",
      summary: moved
        ? `Termin auf ${formatDateTime(appointment.start)} Uhr verschoben${
            appointment.employee ? ` – ${appointment.employee.firstName} ${appointment.employee.lastName}` : ""
          }.`
        : `Termin am ${formatDateTime(appointment.start)} Uhr aktualisiert.`,
      data: appointment,
      entityType: "appointment",
      entityId: appointment.id,
    };
  },

  async confirm_appointment(args, context) {
    const db = tenantDb(context.tenantId);
    const existing = await db.appointment.findFirst({ where: { id: args.appointmentId } });
    if (!existing) throw new NotFoundError("Termin nicht gefunden.");

    const conflict = await db.appointment.findFirst({
      where: {
        id: { not: existing.id },
        employeeId: existing.employeeId,
        status: "CONFIRMED",
        start: { lt: existing.end },
        end: { gt: existing.start },
      },
    });
    if (conflict) {
      throw new AppError("Der Termin überschneidet sich mit einem bereits bestätigten Termin.", 409, "conflict");
    }

    const appointment = await db.appointment.update({
      where: { id: args.appointmentId },
      data: { status: "CONFIRMED" },
    });
    if (appointment.orderId) {
      const scheduled = await db.orderStatus.findFirst({ where: { key: "scheduled" } });
      if (scheduled) {
        await db.order.update({ where: { id: appointment.orderId }, data: { statusId: scheduled.id } });
      }
    }

    return {
      actionKey: "confirm_appointment",
      summary: `Termin am ${formatDateTime(appointment.start)} Uhr verbindlich gebucht.`,
      data: appointment,
      entityType: "appointment",
      entityId: appointment.id,
    };
  },

  async draft_email(args, context) {
    const db = tenantDb(context.tenantId);
    const email = await db.email.create({
      data: {
        tenantId: context.tenantId,
        direction: "OUTBOUND",
        status: "DRAFT",
        fromEmail: args.from ?? "",
        toEmails: [args.to],
        subject: args.subject,
        bodyText: args.body,
        customerId: args.customerId || null,
        orderId: args.orderId || null,
        replyToId: args.replyToEmailId || null,
      },
    });
    return {
      actionKey: "draft_email",
      summary: `Antwortentwurf an ${args.to} erstellt.`,
      data: email,
      entityType: "email",
      entityId: email.id,
    };
  },

  async send_email(args, context) {
    const email = await sendDraft(context.tenantId, args.emailId);
    return {
      actionKey: "send_email",
      summary: email.processingError
        ? `E-Mail an ${email.toEmails.join(", ")} gespeichert – ${email.processingError}`
        : `E-Mail an ${email.toEmails.join(", ")} versendet.`,
      data: email,
      entityType: "email",
      entityId: email.id,
    };
  },

  async search_documents(args, context) {
    const db = tenantDb(context.tenantId);
    const documents = await db.document.findMany({
      where: {
        ...(args.customerId ? { customerId: args.customerId } : {}),
        ...(args.orderId ? { orderId: args.orderId } : {}),
        ...(args.query
          ? {
              OR: [
                { filename: { contains: args.query, mode: "insensitive" as const } },
                { extractedText: { contains: args.query, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      take: 20,
      orderBy: { createdAt: "desc" },
    });
    return {
      actionKey: "search_documents",
      summary: `${documents.length} Dokumente gefunden.`,
      data: documents.map((document) => ({
        id: document.id,
        filename: document.filename,
        createdAt: document.createdAt.toISOString(),
        summary: (document.aiExtraction as any)?.summary ?? null,
      })),
    };
  },

  async create_task(args, context) {
    const db = tenantDb(context.tenantId);
    const task = await db.task.create({
      data: {
        tenantId: context.tenantId,
        title: args.title,
        description: args.description ?? "",
        dueAt: args.dueAt ? new Date(args.dueAt) : null,
        customerId: args.customerId || null,
        orderId: args.orderId || null,
        priority: (args.priority as Priority) ?? "NORMAL",
        createdByAI: context.actor.type === "AI",
      },
    });
    return {
      actionKey: "create_task",
      summary: `Aufgabe „${truncate(task.title, 60)}" angelegt.`,
      data: task,
      entityType: "task",
      entityId: task.id,
    };
  },

  async search_emails(args, context) {
    const db = tenantDb(context.tenantId);
    const since = args.unansweredSinceDays
      ? new Date(Date.now() - Number(args.unansweredSinceDays) * 24 * 60 * 60 * 1000)
      : undefined;

    const emails = await db.email.findMany({
      where: {
        direction: "INBOUND",
        ...(args.customerId ? { customerId: args.customerId } : {}),
        ...(args.status ? { status: args.status } : {}),
        ...(since ? { receivedAt: { lte: since }, status: { in: ["RECEIVED", "NEEDS_APPROVAL"] } } : {}),
        ...(args.query
          ? {
              OR: [
                { subject: { contains: args.query, mode: "insensitive" as const } },
                { bodyText: { contains: args.query, mode: "insensitive" as const } },
                { fromEmail: { contains: args.query, mode: "insensitive" as const } },
                { fromName: { contains: args.query, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      include: { customer: true },
      orderBy: { receivedAt: "desc" },
      take: 25,
    });

    return {
      actionKey: "search_emails",
      summary: `${emails.length} E-Mails gefunden.`,
      data: emails.map((email) => ({
        id: email.id,
        from: email.fromName || email.fromEmail,
        subject: email.subject,
        receivedAt: email.receivedAt.toISOString(),
        status: email.status,
        category: email.categoryKey,
        customer: email.customer ? customerDisplayName(email.customer) : null,
        preview: truncate(email.bodyText, 200),
      })),
    };
  },

  async get_analytics(args, context) {
    const { getAnalytics } = await import("@/modules/analytics/service");
    const data = await getAnalytics(context.tenantId, Number(args.days) || 30);
    return {
      actionKey: "get_analytics",
      summary: `Kennzahlen der letzten ${data.days} Tage.`,
      data,
    };
  },
};

export function listHandlerKeys(): string[] {
  return Object.keys(HANDLERS);
}

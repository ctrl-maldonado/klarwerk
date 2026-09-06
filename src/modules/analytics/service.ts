import { tenantDb } from "@/lib/tenant-db";
import { getUsageSummary } from "@/modules/billing/usage";

/**
 * Zeitersparnis-Schätzung (§34).
 * Die Annahmen sind offengelegt und konfigurierbar – die Zahl wird in der
 * Oberfläche ausdrücklich als Schätzung ausgewiesen.
 */
export const TIME_SAVED_MINUTES: Record<string, number> = {
  email_classified: 2,
  create_customer: 4,
  create_order: 6,
  create_appointment: 8,
  draft_email: 7,
  create_task: 2,
  update_order: 2,
};

export interface AnalyticsResult {
  days: number;
  from: string;
  requests: number;
  processedAutomatically: number;
  processedManually: number;
  openOrders: number;
  openApprovals: number;
  urgentOrders: number;
  approvalRate: number;
  aiErrorRate: number;
  averageHandlingMinutes: number | null;
  savedMinutes: number;
  savedHours: number;
  aiCalls: number;
  aiCostEuro: number;
  demoShare: number;
  overrideRate: number;
  byCategory: Array<{ key: string; count: number }>;
  byPriority: Array<{ key: string; count: number }>;
  timeSavedAssumptions: Record<string, number>;
}

export async function getAnalytics(tenantId: string, days = 30): Promise<AnalyticsResult> {
  const db = tenantDb(tenantId);
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [
    requests,
    processedAutomatically,
    processedManually,
    openOrders,
    urgentOrders,
    approvals,
    executions,
    handledEmails,
    categoryGroups,
    priorityGroups,
    auditActions,
    usage,
  ] = await Promise.all([
    db.email.count({ where: { direction: "INBOUND", receivedAt: { gte: from } } }),
    db.email.count({ where: { direction: "INBOUND", receivedAt: { gte: from }, status: "PROCESSED" } }),
    db.email.count({ where: { direction: "INBOUND", receivedAt: { gte: from }, status: "HANDLED" } }),
    db.order.count({ where: { deletedAt: null, status: { isTerminal: false } } }),
    db.order.count({ where: { deletedAt: null, priority: "URGENT", status: { isTerminal: false } } }),
    db.approvalRequest.groupBy({ by: ["status"], where: { createdAt: { gte: from } }, _count: { _all: true } }),
    db.aIExecution.groupBy({ by: ["status"], where: { createdAt: { gte: from } }, _count: { _all: true } }),
    db.email.findMany({
      where: { direction: "INBOUND", receivedAt: { gte: from }, status: { in: ["PROCESSED", "HANDLED"] } },
      select: { receivedAt: true, updatedAt: true },
      take: 500,
    }),
    db.email.groupBy({ by: ["categoryKey"], where: { direction: "INBOUND", receivedAt: { gte: from } }, _count: { _all: true } }),
    db.order.groupBy({ by: ["priority"], where: { createdAt: { gte: from } }, _count: { _all: true } }),
    db.auditLog.groupBy({ by: ["action"], where: { at: { gte: from }, result: "success" }, _count: { _all: true } }),
    getUsageSummary(tenantId),
  ]);

  const approvalCounts = Object.fromEntries(approvals.map((row) => [row.status, row._count._all]));
  const approvedCount = (approvalCounts.APPROVED ?? 0) + (approvalCounts.EXECUTED ?? 0);
  const decidedCount = approvedCount + (approvalCounts.REJECTED ?? 0);

  const executionCounts = Object.fromEntries(executions.map((row) => [row.status, row._count._all]));
  const totalExecutions = Object.values(executionCounts).reduce((a, b) => a + b, 0);

  const costRows = await db.aIExecution.aggregate({
    where: { createdAt: { gte: from } },
    _sum: { costMicroCents: true },
    _count: { _all: true },
  });
  const demoCount = await db.aIExecution.count({ where: { createdAt: { gte: from }, isDemo: true } });

  const savedMinutes = auditActions.reduce((total, row) => {
    const minutes = TIME_SAVED_MINUTES[row.action] ?? 0;
    return total + minutes * row._count._all;
  }, 0) + (processedAutomatically + processedManually) * TIME_SAVED_MINUTES.email_classified;

  const handlingDurations = handledEmails
    .map((email) => (email.updatedAt.getTime() - email.receivedAt.getTime()) / 60000)
    .filter((minutes) => minutes >= 0 && minutes < 60 * 24 * 30);

  return {
    days,
    from: from.toISOString(),
    requests,
    processedAutomatically,
    processedManually,
    openOrders,
    urgentOrders,
    openApprovals: approvalCounts.PENDING ?? 0,
    approvalRate: decidedCount ? Math.round((approvedCount / decidedCount) * 100) : 0,
    aiErrorRate: totalExecutions ? Math.round(((executionCounts.FAILED ?? 0) / totalExecutions) * 100) : 0,
    averageHandlingMinutes: handlingDurations.length
      ? Math.round(handlingDurations.reduce((a, b) => a + b, 0) / handlingDurations.length)
      : null,
    savedMinutes,
    savedHours: Math.round((savedMinutes / 60) * 10) / 10,
    aiCalls: costRows._count._all,
    aiCostEuro: Math.round(((costRows._sum.costMicroCents ?? 0) / 1_000_000) * 100) / 100,
    demoShare: costRows._count._all ? Math.round((demoCount / costRows._count._all) * 100) : 0,
    overrideRate: decidedCount ? Math.round(((approvalCounts.REJECTED ?? 0) / decidedCount) * 100) : 0,
    byCategory: categoryGroups
      .map((row) => ({ key: row.categoryKey ?? "unklassifiziert", count: row._count._all }))
      .sort((a, b) => b.count - a.count),
    byPriority: priorityGroups.map((row) => ({ key: row.priority, count: row._count._all })),
    timeSavedAssumptions: TIME_SAVED_MINUTES,
  };
}

export async function getDashboardSummary(tenantId: string) {
  const db = tenantDb(tenantId);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const [newEmails, openQuotes, todaysAppointments, urgentOrders, openApprovals, openTasks] = await Promise.all([
    db.email.count({ where: { direction: "INBOUND", status: { in: ["RECEIVED", "PROCESSING"] } } }),
    db.order.count({ where: { deletedAt: null, status: { key: "quote_required" } } }),
    db.appointment.count({ where: { start: { gte: startOfDay, lt: endOfDay }, status: { in: ["PROPOSED", "CONFIRMED"] } } }),
    db.order.count({ where: { deletedAt: null, priority: "URGENT", status: { isTerminal: false } } }),
    db.approvalRequest.count({ where: { status: "PENDING" } }),
    db.task.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
  ]);

  return { newEmails, openQuotes, todaysAppointments, urgentOrders, openApprovals, openTasks };
}

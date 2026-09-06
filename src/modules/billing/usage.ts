import { tenantDb } from "@/lib/tenant-db";

export type UsageMetric =
  | "ai_calls"
  | "emails_processed"
  | "emails_sent"
  | "documents"
  | "automations"
  | "orders_created";

export function currentPeriodKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Verbrauchserfassung für Abrechnung und Limits (§35). */
export async function recordUsage(
  tenantId: string,
  metric: UsageMetric,
  quantity = 1,
  meta: Record<string, unknown> = {},
): Promise<void> {
  await tenantDb(tenantId).usageRecord.create({
    data: { tenantId, metric, quantity, periodKey: currentPeriodKey(), meta: meta as object },
  });
}

export async function getUsageSummary(
  tenantId: string,
  periodKey = currentPeriodKey(),
): Promise<Record<string, number>> {
  const rows = await tenantDb(tenantId).usageRecord.groupBy({
    by: ["metric"],
    where: { periodKey },
    _sum: { quantity: true },
  });
  return Object.fromEntries(rows.map((row) => [row.metric, row._sum.quantity ?? 0]));
}

export const PLANS = [
  {
    key: "STARTER" as const,
    name: "Starter",
    priceCentsPerMonth: 29900,
    description: "Für kleine Betriebe mit einem Büroplatz.",
    limits: { users: 3, emails_processed: 500, ai_calls: 2000, documents: 200, automations: 3 },
  },
  {
    key: "BUSINESS" as const,
    name: "Business",
    priceCentsPerMonth: 69900,
    description: "Für wachsende Betriebe mit mehreren Mitarbeitenden.",
    limits: { users: 10, emails_processed: 2500, ai_calls: 10000, documents: 1000, automations: 15 },
  },
  {
    key: "PRO" as const,
    name: "Pro",
    priceCentsPerMonth: 149900,
    description: "Für Betriebe mit mehreren Standorten und hoher Anfragelast.",
    limits: { users: 50, emails_processed: 10000, ai_calls: 50000, documents: 10000, automations: 100 },
  },
];

export function getPlan(key: string) {
  return PLANS.find((plan) => plan.key === key);
}

/** Prüft ein Limit; liefert null, wenn kein Limit gesetzt ist. */
export async function checkLimit(
  tenantId: string,
  metric: UsageMetric,
): Promise<{ used: number; limit: number | null; exceeded: boolean }> {
  const db = tenantDb(tenantId);
  const subscription = await db.raw.subscription.findUnique({ where: { tenantId } });
  const limits = (subscription?.limits as Record<string, number> | undefined) ?? {};
  const limit = typeof limits[metric] === "number" ? limits[metric] : null;
  const usage = await getUsageSummary(tenantId);
  const used = usage[metric] ?? 0;
  return { used, limit, exceeded: limit !== null && used >= limit };
}

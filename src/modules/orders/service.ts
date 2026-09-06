import type { Priority } from "@prisma/client";
import { tenantDb } from "@/lib/tenant-db";
import { containsKeyword } from "@/modules/ai/text-analysis";
import type { IndustryProfileDefinition } from "@/modules/industry/types";

export async function nextOrderNumber(tenantId: string): Promise<string> {
  const db = tenantDb(tenantId);
  const year = new Date().getFullYear();
  const prefix = `A-${year}-`;
  const latest = await db.order.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  const next = latest ? Number(latest.orderNumber.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function defaultOrderStatusId(tenantId: string): Promise<string> {
  const db = tenantDb(tenantId);
  const status =
    (await db.orderStatus.findFirst({ where: { isDefault: true } })) ??
    (await db.orderStatus.findFirst({ orderBy: { sortOrder: "asc" } }));
  if (!status) throw new Error("Für diesen Betrieb ist kein Auftragsstatus konfiguriert.");
  return status.id;
}

const PRIORITY_ORDER: Priority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

export function maxPriority(a: Priority, b: Priority): Priority {
  return PRIORITY_ORDER.indexOf(a) >= PRIORITY_ORDER.indexOf(b) ? a : b;
}

export interface PriorityDecision {
  priority: Priority;
  reasons: string[];
  escalated: boolean;
}

/**
 * Prioritätsbestimmung (§22).
 * Die Regeln stammen aus dem Branchenprofil, nicht aus dem Code. Sie können den
 * Vorschlag der AI nur nach oben korrigieren – eine Sicherheitsregel darf nicht
 * durch ein Modell abgeschwächt werden.
 */
export function determinePriority(
  text: string,
  suggested: Priority,
  profile: Pick<IndustryProfileDefinition, "priorityRules" | "orderCategories">,
  categoryKey?: string,
): PriorityDecision {
  let priority = suggested;
  const reasons: string[] = [];
  let escalated = false;

  const category = profile.orderCategories.find((entry) => entry.key === categoryKey);
  if (category) {
    const next = maxPriority(priority, category.defaultPriority);
    if (next !== priority) {
      escalated = true;
      reasons.push(`Kategorie „${category.label}" ist mindestens ${category.defaultPriority}.`);
      priority = next;
    }
  }

  for (const rule of profile.priorityRules) {
    const keywordHit = rule.keywords?.length ? containsKeyword(text, rule.keywords) : null;
    const categoryHit = rule.categories?.length && categoryKey ? rule.categories.includes(categoryKey) : false;
    if (!keywordHit && !categoryHit) continue;

    const next = maxPriority(priority, rule.priority);
    if (next !== priority) {
      escalated = true;
      priority = next;
      reasons.push(
        keywordHit
          ? `Regel „${rule.description}" (Signalwort „${keywordHit}") → ${rule.priority}.`
          : `Regel „${rule.description}" → ${rule.priority}.`,
      );
    }
  }

  if (!reasons.length) reasons.push("Priorität aus der Analyse der Nachricht übernommen.");
  return { priority, reasons, escalated };
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Niedrig",
  NORMAL: "Normal",
  HIGH: "Hoch",
  URGENT: "Dringend",
};

export const PRIORITY_STYLES: Record<Priority, string> = {
  LOW: "bg-slate-100 text-slate-600 ring-slate-200",
  NORMAL: "bg-sky-50 text-sky-700 ring-sky-200",
  HIGH: "bg-amber-50 text-amber-700 ring-amber-200",
  URGENT: "bg-red-50 text-red-700 ring-red-200",
};

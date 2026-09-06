import type { Customer } from "@prisma/client";
import { tenantDb } from "@/lib/tenant-db";
import { normalize, similarity } from "@/modules/ai/text-analysis";

export function customerDisplayName(customer: {
  companyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const person = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
  return customer.companyName || person || customer.email || "Unbenannter Kunde";
}

export async function nextCustomerNumber(tenantId: string): Promise<string> {
  const db = tenantDb(tenantId);
  const year = new Date().getFullYear();
  const prefix = `K-${year}-`;
  const latest = await db.customer.findFirst({
    where: { customerNumber: { startsWith: prefix } },
    orderBy: { customerNumber: "desc" },
    select: { customerNumber: true },
  });
  const next = latest ? Number(latest.customerNumber.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export interface CustomerMatch {
  customer: Customer;
  confidence: number;
  reasons: string[];
}

/**
 * Unscharfe Kundenzuordnung (§11).
 * E-Mail und Telefonnummer sind starke Signale, Name und Adresse schwächere.
 * Bei Unsicherheit gibt die Funktion mehrere Kandidaten zurück – die Oberfläche
 * fragt dann nach ("Meinst du Max Mustermann?").
 */
export async function findMatchingCustomers(
  tenantId: string,
  hints: { name?: string; email?: string; phone?: string; street?: string; zip?: string; companyName?: string },
  limit = 5,
): Promise<CustomerMatch[]> {
  const db = tenantDb(tenantId);
  const candidates = await db.customer.findMany({ where: { deletedAt: null }, take: 500 });

  const normalizedPhone = hints.phone?.replace(/\D/g, "").slice(-9);
  const matches: CustomerMatch[] = [];

  for (const customer of candidates) {
    const reasons: string[] = [];
    let confidence = 0;

    if (hints.email && customer.email && normalize(customer.email) === normalize(hints.email)) {
      confidence = Math.max(confidence, 0.97);
      reasons.push("E-Mail-Adresse stimmt überein");
    }

    if (normalizedPhone && customer.phone) {
      const candidatePhone = customer.phone.replace(/\D/g, "").slice(-9);
      if (candidatePhone && candidatePhone === normalizedPhone) {
        confidence = Math.max(confidence, 0.95);
        reasons.push("Telefonnummer stimmt überein");
      }
    }

    const displayName = customerDisplayName(customer);
    const nameHint = hints.companyName || hints.name;
    if (nameHint) {
      const nameScore = similarity(displayName, nameHint);
      if (nameScore > 0.82) {
        confidence = Math.max(confidence, 0.55 + nameScore * 0.3);
        reasons.push(`Name ähnelt „${displayName}"`);
      } else if (nameScore > 0.6) {
        confidence = Math.max(confidence, 0.4 + nameScore * 0.2);
        reasons.push(`Name teilweise ähnlich zu „${displayName}"`);
      }
    }

    if (hints.street && customer.street && similarity(customer.street, hints.street) > 0.85) {
      confidence = Math.min(confidence + 0.2, 0.99);
      reasons.push("Adresse stimmt überein");
    }
    if (hints.zip && customer.zip && customer.zip === hints.zip && confidence > 0) {
      confidence = Math.min(confidence + 0.05, 0.99);
      reasons.push("Postleitzahl stimmt überein");
    }

    if (confidence > 0.35) {
      matches.push({ customer, confidence: Math.round(confidence * 100) / 100, reasons });
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence).slice(0, limit);
}

export async function searchCustomers(tenantId: string, query: string, limit = 20) {
  const db = tenantDb(tenantId);
  if (!query.trim()) {
    return db.customer.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: limit });
  }
  return db.customer.findMany({
    where: {
      deletedAt: null,
      OR: [
        { firstName: { contains: query, mode: "insensitive" } },
        { lastName: { contains: query, mode: "insensitive" } },
        { companyName: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { phone: { contains: query } },
        { city: { contains: query, mode: "insensitive" } },
        { street: { contains: query, mode: "insensitive" } },
        { customerNumber: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
}

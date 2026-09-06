import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/crypto";
import { AppError, UnauthorizedError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getAuthContext } from "@/modules/auth/context";
import { grantsPermission } from "@/lib/rbac";

export interface ApiCaller {
  tenantId: string;
  permissions: string[];
  label: string;
  userId?: string;
  via: "session" | "api_key";
}

/**
 * Authentifizierung für die REST-Schnittstelle (§25).
 * Entweder über die angemeldete Sitzung oder über einen API-Schlüssel des Mandanten.
 */
export async function authenticateRequest(request: Request): Promise<ApiCaller> {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    const key = await prisma.apiKey.findUnique({ where: { keyHash: hashToken(token) }, include: { tenant: true } });
    if (!key || key.revokedAt) throw new UnauthorizedError("Ungültiger API-Schlüssel.");

    enforceRateLimit({ key: `api:${key.id}`, limit: 120, windowMs: 60_000 });
    await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });

    return { tenantId: key.tenantId, permissions: key.scopes, label: `API-Schlüssel ${key.name}`, via: "api_key" };
  }

  const context = await getAuthContext();
  if (!context) throw new UnauthorizedError();
  return {
    tenantId: context.tenant.id,
    permissions: context.permissions,
    label: context.user.name,
    userId: context.user.id,
    via: "session",
  };
}

export function requireScope(caller: ApiCaller, permission: string): void {
  if (!grantsPermission(caller.permissions, permission)) {
    throw new AppError(`Fehlende Berechtigung: ${permission}`, 403, "forbidden");
  }
}

export function apiError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
  return NextResponse.json({ error: { code: "internal_error", message } }, { status: 500 });
}

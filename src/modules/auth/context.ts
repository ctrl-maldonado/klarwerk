import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role, Tenant, TenantSettings, User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { assertPermission, expandPermissions, hasPermission } from "@/lib/rbac";
import { getSessionUserId } from "./session";

export interface AuthContext {
  user: User;
  role: Role | null;
  tenant: Tenant & { settings: TenantSettings | null };
  permissions: string[];
  can: (permission: string | string[]) => boolean;
  assert: (permission: string | string[]) => void;
}

/** Pro Request einmal geladen. */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true, tenant: { include: { settings: true } } },
  });

  if (!user || !user.isActive || user.deletedAt) return null;
  if (!user.tenant) return null;

  const permissions = user.role?.permissions ?? [];
  return {
    user,
    role: user.role,
    tenant: user.tenant,
    permissions,
    can: (permission) => hasPermission(permissions, permission),
    assert: (permission) => assertPermission(permissions, permission),
  };
});

export async function requireAuth(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) redirect("/login");
  return context;
}

/** Für Server Actions und API-Routen: wirft statt umzuleiten. */
export async function requireAuthApi(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) throw new UnauthorizedError();
  return context;
}

export async function requirePermission(permission: string | string[]): Promise<AuthContext> {
  const context = await requireAuth();
  if (!context.can(permission)) {
    throw new ForbiddenError(
      `Ihre Rolle „${context.role?.name ?? "unbekannt"}" hat keinen Zugriff auf diesen Bereich.`,
    );
  }
  return context;
}

export async function requireOnboarded(): Promise<AuthContext> {
  const context = await requireAuth();
  if (!context.tenant.onboardingCompleted) redirect("/onboarding");
  return context;
}

export function describePermissions(permissions: string[]): string[] {
  return expandPermissions(permissions);
}

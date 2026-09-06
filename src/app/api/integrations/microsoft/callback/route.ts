import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { encryptSecret, safeEqual } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { requireAuthApi } from "@/modules/auth/context";
import { exchangeMicrosoftCode, MICROSOFT_SCOPES } from "@/modules/email/providers/microsoft";
import { writeAudit } from "@/modules/audit";
import { apiError } from "@/modules/api/auth";

export async function GET(request: Request) {
  try {
    const context = await requireAuthApi();
    context.assert("integrations:write");

    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const cookieStore = await cookies();
    const expected = cookieStore.get("kw_oauth_state")?.value;
    cookieStore.delete("kw_oauth_state");

    if (!code || !state || !expected || !safeEqual(state, expected)) {
      return NextResponse.redirect(`${env.appUrl}/einstellungen/integrationen?fehler=state`);
    }

    const tokens = await exchangeMicrosoftCode(code, `${env.appUrl}/api/integrations/microsoft/callback`);

    const profile = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);

    await prisma.integration.upsert({
      where: { tenantId_providerKey_type: { tenantId: context.tenant.id, providerKey: "microsoft365", type: "EMAIL" } },
      update: {
        status: "CONNECTED",
        encryptedCredentials: encryptSecret(JSON.stringify(tokens)),
        accountEmail: profile?.mail ?? profile?.userPrincipalName ?? null,
        displayName: "Microsoft 365",
        scopes: MICROSOFT_SCOPES,
        lastError: null,
      },
      create: {
        tenantId: context.tenant.id,
        providerKey: "microsoft365",
        type: "EMAIL",
        status: "CONNECTED",
        encryptedCredentials: encryptSecret(JSON.stringify(tokens)),
        accountEmail: profile?.mail ?? profile?.userPrincipalName ?? null,
        displayName: "Microsoft 365",
        scopes: MICROSOFT_SCOPES,
      },
    });

    await writeAudit({
      tenantId: context.tenant.id,
      actorType: "USER",
      actorUserId: context.user.id,
      actorLabel: context.user.name,
      action: "integration_connected",
      entityType: "integration",
      details: { providerKey: "microsoft365" },
    });

    return NextResponse.redirect(`${env.appUrl}/einstellungen/integrationen`);
  } catch (error) {
    return apiError(error);
  }
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { encryptSecret, safeEqual } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { requireAuthApi } from "@/modules/auth/context";
import { exchangeGoogleCode, GOOGLE_SCOPES } from "@/modules/email/providers/google";
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

    const tokens = await exchangeGoogleCode(code, `${env.appUrl}/api/integrations/google/callback`);

    const profile = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);

    await prisma.integration.upsert({
      where: { tenantId_providerKey_type: { tenantId: context.tenant.id, providerKey: "google", type: "EMAIL" } },
      update: {
        status: "CONNECTED",
        encryptedCredentials: encryptSecret(JSON.stringify(tokens)),
        accountEmail: profile?.email ?? null,
        displayName: "Google Workspace",
        scopes: GOOGLE_SCOPES,
        lastError: null,
      },
      create: {
        tenantId: context.tenant.id,
        providerKey: "google",
        type: "EMAIL",
        status: "CONNECTED",
        encryptedCredentials: encryptSecret(JSON.stringify(tokens)),
        accountEmail: profile?.email ?? null,
        displayName: "Google Workspace",
        scopes: GOOGLE_SCOPES,
      },
    });

    await writeAudit({
      tenantId: context.tenant.id,
      actorType: "USER",
      actorUserId: context.user.id,
      actorLabel: context.user.name,
      action: "integration_connected",
      entityType: "integration",
      details: { providerKey: "google" },
    });

    return NextResponse.redirect(`${env.appUrl}/einstellungen/integrationen`);
  } catch (error) {
    return apiError(error);
  }
}

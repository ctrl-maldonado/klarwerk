import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { randomToken } from "@/lib/crypto";
import { requireAuthApi } from "@/modules/auth/context";
import { googleAuthUrl } from "@/modules/email/providers/google";
import { apiError } from "@/modules/api/auth";

export async function GET() {
  try {
    const context = await requireAuthApi();
    context.assert("integrations:write");
    if (!env.google.configured) {
      return NextResponse.json(
        { error: { code: "not_configured", message: "Für diese Installation sind keine Google-Zugangsdaten hinterlegt." } },
        { status: 501 },
      );
    }

    const state = randomToken(16);
    const cookieStore = await cookies();
    cookieStore.set("kw_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: env.isProduction, path: "/", maxAge: 600 });

    return NextResponse.redirect(googleAuthUrl(state, `${env.appUrl}/api/integrations/google/callback`));
  } catch (error) {
    return apiError(error);
  }
}

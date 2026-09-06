import { NextResponse } from "next/server";
import { requireAuthApi } from "@/modules/auth/context";
import { exportTenantData } from "@/modules/privacy/service";
import { apiError } from "@/modules/api/auth";

export async function GET() {
  try {
    const context = await requireAuthApi();
    context.assert("settings:write");
    const data = await exportTenantData(context.tenant.id, { userId: context.user.id, label: context.user.name });

    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="klarwerk-export-${context.tenant.slug}-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

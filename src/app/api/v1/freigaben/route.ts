import { NextResponse } from "next/server";
import { tenantDb } from "@/lib/tenant-db";
import { apiError, authenticateRequest, requireScope } from "@/modules/api/auth";

export async function GET(request: Request) {
  try {
    const caller = await authenticateRequest(request);
    requireScope(caller, "ai:approve");

    const approvals = await tenantDb(caller.tenantId).approvalRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    return NextResponse.json({
      data: approvals.map((approval) => ({
        id: approval.id,
        title: approval.title,
        summary: approval.summary,
        riskLevel: approval.riskLevel,
        actions: approval.proposedActions,
        createdAt: approval.createdAt,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

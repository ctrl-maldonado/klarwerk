import { NextResponse } from "next/server";
import { tenantDb } from "@/lib/tenant-db";
import { customerDisplayName } from "@/modules/customers/service";
import { apiError, authenticateRequest, requireScope } from "@/modules/api/auth";
import type { Priority } from "@prisma/client";

export async function GET(request: Request) {
  try {
    const caller = await authenticateRequest(request);
    requireScope(caller, "orders:read");
    const url = new URL(request.url);

    const orders = await tenantDb(caller.tenantId).order.findMany({
      where: {
        deletedAt: null,
        ...(url.searchParams.get("status") ? { status: { key: url.searchParams.get("status")! } } : {}),
        ...(url.searchParams.get("priority") ? { priority: url.searchParams.get("priority") as Priority } : {}),
        ...(url.searchParams.get("offen") === "true" ? { status: { isTerminal: false } } : {}),
      },
      include: { customer: true, status: true, technician: true },
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(url.searchParams.get("limit") ?? 50), 200),
    });

    return NextResponse.json({
      data: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        title: order.title,
        description: order.description,
        category: order.categoryKey,
        priority: order.priority,
        status: order.status.key,
        statusLabel: order.status.label,
        customer: order.customer ? { id: order.customer.id, name: customerDisplayName(order.customer) } : null,
        technician: order.technician ? `${order.technician.firstName} ${order.technician.lastName}` : null,
        createdAt: order.createdAt,
        createdByAI: order.createdByAI,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

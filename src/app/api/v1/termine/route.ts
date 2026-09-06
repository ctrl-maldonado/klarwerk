import { NextResponse } from "next/server";
import { tenantDb } from "@/lib/tenant-db";
import { findAvailableSlots } from "@/modules/calendar/scheduling";
import { apiError, authenticateRequest, requireScope } from "@/modules/api/auth";

export async function GET(request: Request) {
  try {
    const caller = await authenticateRequest(request);
    requireScope(caller, "calendar:read");
    const url = new URL(request.url);

    if (url.searchParams.get("frei") === "true") {
      const slots = await findAvailableSlots({
        tenantId: caller.tenantId,
        durationMinutes: Number(url.searchParams.get("dauer") ?? 90),
        requiredSkills: url.searchParams.get("qualifikation")?.split(",").filter(Boolean),
        zip: url.searchParams.get("plz") ?? undefined,
        limit: Number(url.searchParams.get("limit") ?? 5),
      });
      return NextResponse.json({
        data: slots.map((slot) => ({
          employeeId: slot.employeeId,
          employeeName: slot.employeeName,
          start: slot.start,
          end: slot.end,
          score: slot.score,
          reasons: slot.reasons,
        })),
      });
    }

    const from = url.searchParams.get("von") ? new Date(url.searchParams.get("von")!) : new Date();
    const to = url.searchParams.get("bis")
      ? new Date(url.searchParams.get("bis")!)
      : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const appointments = await tenantDb(caller.tenantId).appointment.findMany({
      where: { start: { gte: from, lte: to } },
      include: { employee: true, customer: true },
      orderBy: { start: "asc" },
      take: 200,
    });

    return NextResponse.json({
      data: appointments.map((appointment) => ({
        id: appointment.id,
        title: appointment.title,
        start: appointment.start,
        end: appointment.end,
        status: appointment.status,
        employee: appointment.employee ? `${appointment.employee.firstName} ${appointment.employee.lastName}` : null,
        location: appointment.location,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

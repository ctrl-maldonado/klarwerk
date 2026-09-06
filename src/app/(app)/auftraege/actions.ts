"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAuthApi } from "@/modules/auth/context";
import { executeAction } from "@/modules/ai/tools";

export interface OrderActionState {
  error?: string;
  success?: string;
}

export async function updateOrderAction(_prev: OrderActionState, formData: FormData): Promise<OrderActionState> {
  try {
    const context = await requireAuthApi();
    const orderId = String(formData.get("orderId"));

    const result = await executeAction(
      "update_order",
      {
        orderId,
        statusKey: String(formData.get("statusKey") ?? "") || undefined,
        priority: String(formData.get("priority") ?? "") || undefined,
        technicianId: String(formData.get("technicianId") ?? "") || undefined,
        note: String(formData.get("note") ?? "").trim() || undefined,
      },
      {
        tenantId: context.tenant.id,
        actor: { type: "USER", userId: context.user.id, label: context.user.name },
        permissions: context.permissions,
        ip: (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      },
      "execute",
    );

    revalidatePath(`/auftraege/${orderId}`);
    revalidatePath("/auftraege");
    return { success: result.summary };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Änderung fehlgeschlagen." };
  }
}

export async function updateAppointmentAction(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  try {
    const context = await requireAuthApi();
    const appointmentId = String(formData.get("appointmentId"));
    const start = String(formData.get("start") ?? "").trim();

    const result = await executeAction(
      "update_appointment",
      {
        appointmentId,
        // datetime-local liefert lokale Zeit ohne Zone; new Date() im Handler
        // legt sie als lokale Zeit des Servers aus – dasselbe, was die Person
        // im Formular gesehen hat.
        start: start || undefined,
        employeeId: String(formData.get("employeeId") ?? ""),
        status: String(formData.get("status") ?? "") || undefined,
      },
      {
        tenantId: context.tenant.id,
        actor: { type: "USER", userId: context.user.id, label: context.user.name },
        permissions: context.permissions,
        ip: (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      },
      "execute",
    );

    const orderId = String(formData.get("orderId") ?? "");
    if (orderId) revalidatePath(`/auftraege/${orderId}`);
    revalidatePath("/kalender");
    revalidatePath("/dashboard");
    return { success: result.summary };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Termin konnte nicht geändert werden." };
  }
}

export async function confirmAppointmentAction(_prev: OrderActionState, formData: FormData): Promise<OrderActionState> {
  try {
    const context = await requireAuthApi();
    const result = await executeAction(
      "confirm_appointment",
      { appointmentId: String(formData.get("appointmentId")) },
      {
        tenantId: context.tenant.id,
        actor: { type: "USER", userId: context.user.id, label: context.user.name },
        permissions: context.permissions,
      },
      "execute",
    );
    revalidatePath("/kalender");
    revalidatePath("/auftraege");
    return { success: result.summary };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Bestätigung fehlgeschlagen." };
  }
}

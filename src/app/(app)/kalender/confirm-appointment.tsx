"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { confirmAppointmentAction, type OrderActionState } from "../auftraege/actions";
import { Button } from "@/components/ui";

function Confirm() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "…" : "Verbindlich buchen"}
    </Button>
  );
}

export function ConfirmAppointment({ appointmentId }: { appointmentId: string }) {
  const [state, action] = useActionState<OrderActionState, FormData>(confirmAppointmentAction, {});

  if (state.success) return <span className="text-xs text-emerald-700">{state.success}</span>;

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
      <Confirm />
    </form>
  );
}

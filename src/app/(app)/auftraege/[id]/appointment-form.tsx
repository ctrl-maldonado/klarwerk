"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { updateAppointmentAction, type OrderActionState } from "../actions";
import { useToast } from "@/components/app/toast";
import { Button, Field, inputClass } from "@/components/ui";

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Wird gespeichert …" : "Termin speichern"}
    </Button>
  );
}

const STATUS_OPTIONS = [
  { value: "PROPOSED", label: "Vorschlag" },
  { value: "CONFIRMED", label: "Verbindlich gebucht" },
  { value: "CANCELLED", label: "Abgesagt" },
];

export function AppointmentForm({
  appointmentId,
  orderId,
  employees,
  current,
}: {
  appointmentId: string;
  orderId: string;
  employees: Array<{ id: string; name: string }>;
  current: { start: string; employeeId: string | null; status: string };
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  async function handleUpdate(formData: FormData) {
    const result: OrderActionState = await updateAppointmentAction({}, formData);
    if (result.error) {
      // Überschneidungen mit bestätigten Terminen landen hier – die Meldung
      // nennt den kollidierenden Termin und muss stehen bleiben.
      toast({ tone: "error", title: "Termin nicht geändert", detail: result.error });
      return;
    }
    setOpen(false);
    toast({ tone: "success", title: "Termin geändert", detail: result.success });
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Termin ändern
      </Button>
    );
  }

  return (
    <form action={handleUpdate} className="mt-3 space-y-3 border-t border-ink-200 pt-3">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="orderId" value={orderId} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Beginn">
          <input type="datetime-local" name="start" defaultValue={current.start} required className={inputClass} />
        </Field>
        <Field label="Zuständig">
          <select name="employeeId" defaultValue={current.employeeId ?? ""} className={inputClass}>
            <option value="">nicht zugewiesen</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stand">
          <select name="status" defaultValue={current.status} className={inputClass}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <p className="text-xs text-ink-500">Die geplante Dauer bleibt beim Verschieben erhalten.</p>

      <div className="flex gap-2">
        <Save />
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

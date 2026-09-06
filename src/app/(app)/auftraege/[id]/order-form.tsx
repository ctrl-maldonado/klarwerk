"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateOrderAction, type OrderActionState } from "../actions";
import { Alert, Button, Field, inputClass } from "@/components/ui";
import { PRIORITY_LABELS } from "@/modules/orders/service";

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird gespeichert …" : "Änderung speichern"}
    </Button>
  );
}

export function OrderForm({
  orderId,
  statuses,
  employees,
  current,
}: {
  orderId: string;
  statuses: Array<{ key: string; label: string }>;
  employees: Array<{ id: string; name: string }>;
  current: { statusKey: string; priority: string; technicianId: string | null };
}) {
  const [state, action] = useActionState<OrderActionState, FormData>(updateOrderAction, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="orderId" value={orderId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Status">
          <select name="statusKey" defaultValue={current.statusKey} className={inputClass}>
            {statuses.map((status) => (
              <option key={status.key} value={status.key}>
                {status.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priorität">
          <select name="priority" defaultValue={current.priority} className={inputClass}>
            {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Techniker">
          <select name="technicianId" defaultValue={current.technicianId ?? ""} className={inputClass}>
            <option value="">nicht zugewiesen</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Notiz anhängen (optional)">
        <input name="note" className={inputClass} placeholder="z. B. Kunde telefonisch informiert" />
      </Field>

      <Save />
    </form>
  );
}

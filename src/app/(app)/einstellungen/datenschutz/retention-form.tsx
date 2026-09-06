"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateRetentionAction, type SettingsState } from "../actions";
import { Alert, Button, Field, inputClass } from "@/components/ui";

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird gespeichert …" : "Speichern"}
    </Button>
  );
}

export function RetentionForm({
  initial,
  canWrite,
}: {
  canWrite: boolean;
  initial: { retentionDaysEmails: number; retentionDaysAuditLogs: number; shareCustomerDataWithAI: boolean };
}) {
  const [state, action] = useActionState<SettingsState, FormData>(updateRetentionAction, {});

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nachrichten aufbewahren (Tage)" hint="Mindestens 30 Tage.">
          <input
            type="number"
            name="retentionDaysEmails"
            min={30}
            defaultValue={initial.retentionDaysEmails}
            className={inputClass}
            disabled={!canWrite}
          />
        </Field>
        <Field label="Protokoll aufbewahren (Tage)" hint="Mindestens 365 Tage.">
          <input
            type="number"
            name="retentionDaysAuditLogs"
            min={365}
            defaultValue={initial.retentionDaysAuditLogs}
            className={inputClass}
            disabled={!canWrite}
          />
        </Field>
      </div>

      <label className="flex items-start gap-2 text-sm text-ink-700">
        <input
          type="checkbox"
          name="shareCustomerDataWithAI"
          defaultChecked={initial.shareCustomerDataWithAI}
          disabled={!canWrite}
          className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-600"
        />
        <span>
          Kundenname und Adresse dürfen an den AI-Anbieter übertragen werden.
          <span className="block text-xs text-ink-500">
            Ohne diese Angaben fällt die Zuordnung zu Bestandskunden schwerer.
          </span>
        </span>
      </label>

      {canWrite ? <Save /> : null}
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createUserAction, type SettingsState } from "../actions";
import { Alert, Button, Field, inputClass } from "@/components/ui";

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird angelegt …" : "Benutzer anlegen"}
    </Button>
  );
}

export function UserForm({ roles }: { roles: Array<{ key: string; name: string }> }) {
  const [state, action] = useActionState<SettingsState, FormData>(createUserAction, {});

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <input name="name" required className={inputClass} />
        </Field>
        <Field label="E-Mail-Adresse">
          <input name="email" type="email" required className={inputClass} />
        </Field>
        <Field label="Rolle">
          <select name="roleKey" defaultValue="office_manager" className={inputClass}>
            {roles.map((role) => (
              <option key={role.key} value={role.key}>
                {role.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Erstpasswort" hint="Mindestens 10 Zeichen, Groß-/Kleinbuchstaben und eine Ziffer.">
          <input name="password" type="password" required autoComplete="new-password" className={inputClass} />
        </Field>
      </div>
      <Save />
    </form>
  );
}

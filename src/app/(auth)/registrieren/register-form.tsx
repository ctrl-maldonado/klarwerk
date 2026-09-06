"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { registerAction, type FormState } from "../actions";
import { Alert, Button, Field, inputClass } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Betrieb wird angelegt …" : "Betrieb anlegen"}
    </Button>
  );
}

export function RegisterForm({ industries }: { industries: Array<{ key: string; name: string }> }) {
  const [state, action] = useActionState<FormState, FormData>(registerAction, {});

  return (
    <form action={action} className="mt-6 space-y-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="Ihr Name">
        <input name="name" required autoComplete="name" className={inputClass} />
      </Field>
      <Field label="Firmenname">
        <input name="companyName" required autoComplete="organization" className={inputClass} />
      </Field>
      <Field label="Branche">
        <select name="industryKey" defaultValue="plumbing_heating" className={inputClass}>
          {industries.map((industry) => (
            <option key={industry.key} value={industry.key}>
              {industry.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="E-Mail-Adresse">
        <input name="email" type="email" required autoComplete="email" className={inputClass} />
      </Field>
      <Field label="Passwort" hint="Mindestens 10 Zeichen, Groß- und Kleinbuchstaben sowie eine Ziffer.">
        <input name="password" type="password" required autoComplete="new-password" className={inputClass} />
      </Field>
      <SubmitButton />
    </form>
  );
}

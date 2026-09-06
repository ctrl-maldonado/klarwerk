"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, type FormState } from "../actions";
import { Alert, Button, Field, inputClass } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Anmelden …" : "Anmelden"}
    </Button>
  );
}

export function LoginForm() {
  const [state, action] = useActionState<FormState, FormData>(loginAction, {});

  return (
    <form action={action} className="mt-6 space-y-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label="E-Mail-Adresse">
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <Field label="Passwort">
        <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </Field>
      <SubmitButton />
    </form>
  );
}

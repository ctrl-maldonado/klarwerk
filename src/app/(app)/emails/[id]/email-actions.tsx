"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { markHandledAction, processEmailAction, type EmailActionState } from "../actions";
import { Alert, Button } from "@/components/ui";

function Pending({ label, busy, variant = "primary" }: { label: string; busy: string; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}

export function EmailActions({
  emailId,
  canProcess,
  canWrite,
  alreadyProcessed,
}: {
  emailId: string;
  canProcess: boolean;
  canWrite: boolean;
  alreadyProcessed: boolean;
}) {
  const [state, action] = useActionState<EmailActionState, FormData>(processEmailAction, {});

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canProcess ? (
          <form action={action}>
            <input type="hidden" name="emailId" value={emailId} />
            <Pending label={alreadyProcessed ? "Erneut verarbeiten" : "Von Klarwerk verarbeiten lassen"} busy="Klarwerk arbeitet …" />
          </form>
        ) : null}
        {canWrite && !alreadyProcessed ? (
          <form action={markHandledAction}>
            <input type="hidden" name="emailId" value={emailId} />
            <Pending label="Als erledigt markieren" busy="…" variant="secondary" />
          </form>
        ) : null}
      </div>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
    </div>
  );
}

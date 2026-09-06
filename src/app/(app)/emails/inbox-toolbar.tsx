"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { simulateInboundAction, syncInboxAction, type EmailActionState } from "./actions";
import { Alert, Button, Card, CardBody, CardHeader, Field, inputClass } from "@/components/ui";

function Pending({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? busy : label}
    </Button>
  );
}

export function InboxToolbar({ canWrite, hasMailbox }: { canWrite: boolean; hasMailbox: boolean }) {
  const [syncState, syncAction] = useActionState<EmailActionState, FormData>(syncInboxAction, {});
  const [createState, createAction] = useActionState<EmailActionState, FormData>(simulateInboundAction, {});
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full space-y-3 sm:w-auto">
      <div className="flex flex-wrap items-center gap-2">
        {hasMailbox ? (
          <form action={syncAction}>
            <Pending label="Neue Nachrichten abrufen" busy="Wird abgerufen …" />
          </form>
        ) : null}
        {canWrite ? (
          <Button type="button" variant="secondary" onClick={() => setOpen((value) => !value)}>
            {open ? "Schließen" : "Anfrage erfassen"}
          </Button>
        ) : null}
      </div>

      {syncState.error ? <Alert tone="danger">{syncState.error}</Alert> : null}
      {syncState.success ? <Alert tone="success">{syncState.success}</Alert> : null}

      {open ? (
        <Card className="w-full sm:w-[28rem]">
          <CardHeader
            title="Eingehende Anfrage erfassen"
            description="Für Anrufe, Formulare oder zum Ausprobieren. Klarwerk verarbeitet die Nachricht sofort."
          />
          <CardBody>
            <form action={createAction} className="space-y-3">
              {createState.error ? <Alert tone="danger">{createState.error}</Alert> : null}
              <Field label="Name">
                <input name="fromName" className={inputClass} placeholder="Max Mustermann" />
              </Field>
              <Field label="E-Mail-Adresse">
                <input name="fromEmail" type="email" required className={inputClass} placeholder="max@example.de" />
              </Field>
              <Field label="Betreff">
                <input name="subject" className={inputClass} placeholder="Heizung funktioniert nicht" />
              </Field>
              <Field label="Nachricht">
                <textarea
                  name="body"
                  required
                  rows={6}
                  className={inputClass}
                  placeholder="Hallo, unsere Heizung funktioniert seit gestern nicht mehr. Wir wohnen in der Hauptstraße 15 …"
                />
              </Field>
              <Pending label="Erfassen und verarbeiten" busy="Klarwerk arbeitet …" />
            </form>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

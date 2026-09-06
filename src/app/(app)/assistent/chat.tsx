"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { askAction, type ChatState } from "./actions";
import { Alert, Button, Card, CardBody, inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";

function Send() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Denkt nach …" : "Fragen"}
    </Button>
  );
}

export function Chat({ isDemo, demoMessage }: { isDemo: boolean; demoMessage: string }) {
  const [state, action] = useActionState<ChatState, FormData>(askAction, { turns: [] });

  return (
    <Card>
      <CardBody className="space-y-4">
        {isDemo ? <Alert tone="warning" title="Demo-Modus">{demoMessage}</Alert> : null}

        {state.turns.length ? (
          <div className="space-y-3">
            {state.turns.map((turn, index) => (
              <div
                key={index}
                className={cn(
                  "max-w-[85%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-line",
                  turn.role === "user" ? "ml-auto bg-brand-600 text-white" : "bg-ink-100 text-ink-800",
                )}
              >
                {turn.content}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-500">Stellen Sie Ihre erste Frage.</p>
        )}

        {state.steps?.length ? (
          <details className="rounded-lg bg-ink-50 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-ink-500">
              Verwendete Quellen ({state.steps.length})
            </summary>
            <ul className="mt-1 space-y-0.5">
              {state.steps.map((step, index) => (
                <li key={index} className={cn("text-xs", step.ok ? "text-ink-500" : "text-red-600")}>
                  {step.actionKey}: {step.summary}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        <form action={action} className="flex gap-2">
          <label htmlFor="assistent-frage" className="sr-only">
            Ihre Frage an Klarwerk
          </label>
          <input
            id="assistent-frage"
            name="question"
            placeholder="Ihre Frage …"
            required
            className={cn(inputClass, "flex-1")}
            autoComplete="off"
          />
          <Send />
        </form>
      </CardBody>
    </Card>
  );
}

"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  connectDemoMailboxAction,
  finishOnboardingAction,
  saveCompanyAction,
  saveHoursAction,
  saveIndustryAction,
  skipStepAction,
  type StepState,
} from "./actions";
import { Alert, Badge, Button, Field, inputClass } from "@/components/ui";

const WEEKDAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird gespeichert …" : children}
    </Button>
  );
}

function SkipButton({ next, label = "Später einrichten" }: { next: number; label?: string }) {
  return (
    <form action={skipStepAction}>
      <input type="hidden" name="next" value={next} />
      <Button type="submit" variant="ghost">
        {label}
      </Button>
    </form>
  );
}

export function WelcomeStep({ companyName }: { companyName: string }) {
  return (
    <div>
      <h1 className="text-xl font-semibold text-ink-900">Willkommen bei Klarwerk.</h1>
      <p className="mt-2 text-sm text-ink-600">
        Klarwerk übernimmt die Büroarbeit rund um eingehende Kundenanfragen: lesen, verstehen, Auftrag und Termin
        vorbereiten, Antwort entwerfen. Sie bestätigen nur noch.
      </p>
      <p className="mt-4 text-sm text-ink-600">
        Die Einrichtung dauert etwa fünf Minuten. Wir legen zuerst die Daten von <strong>{companyName}</strong> an.
      </p>
      <div className="mt-6 flex gap-2">
        <form action={skipStepAction}>
          <input type="hidden" name="next" value={2} />
          <Submit>Los geht&apos;s</Submit>
        </form>
      </div>
    </div>
  );
}

export function CompanyStep({
  tenant,
}: {
  tenant: {
    name: string;
    street: string | null;
    zip: string | null;
    city: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    employeeCount: number | null;
  };
}) {
  const [state, action] = useActionState<StepState, FormData>(saveCompanyAction, {});
  return (
    <form action={action}>
      <h1 className="text-xl font-semibold text-ink-900">Ihr Unternehmen</h1>
      <p className="mt-1 text-sm text-ink-500">Diese Angaben verwendet Klarwerk in Antworten an Ihre Kunden.</p>
      {state.error ? (
        <div className="mt-4">
          <Alert tone="danger">{state.error}</Alert>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Firmenname" className="sm:col-span-2">
          <input name="name" defaultValue={tenant.name} required className={inputClass} />
        </Field>
        <Field label="Straße und Hausnummer" className="sm:col-span-2">
          <input name="street" defaultValue={tenant.street ?? ""} className={inputClass} />
        </Field>
        <Field label="Postleitzahl">
          <input name="zip" defaultValue={tenant.zip ?? ""} className={inputClass} />
        </Field>
        <Field label="Ort">
          <input name="city" defaultValue={tenant.city ?? ""} className={inputClass} />
        </Field>
        <Field label="Telefon">
          <input name="phone" defaultValue={tenant.phone ?? ""} className={inputClass} />
        </Field>
        <Field label="E-Mail">
          <input name="email" type="email" defaultValue={tenant.email ?? ""} className={inputClass} />
        </Field>
        <Field label="Website">
          <input name="website" defaultValue={tenant.website ?? ""} className={inputClass} />
        </Field>
        <Field label="Anzahl Mitarbeitende">
          <input name="employeeCount" type="number" min={0} defaultValue={tenant.employeeCount ?? ""} className={inputClass} />
        </Field>
      </div>

      <div className="mt-6 flex items-center gap-2">
        <Submit>Weiter</Submit>
      </div>
    </form>
  );
}

export function IndustryStep({
  industries,
  current,
}: {
  industries: Array<{ key: string; name: string }>;
  current: string;
}) {
  const [state, action] = useActionState<StepState, FormData>(saveIndustryAction, {});
  return (
    <form action={action}>
      <h1 className="text-xl font-semibold text-ink-900">Ihre Branche</h1>
      <p className="mt-1 text-sm text-ink-500">
        Klarwerk richtet Auftragskategorien, Prioritätsregeln und Zusatzfelder passend zu Ihrem Gewerk ein. Sie können
        alles später anpassen.
      </p>
      {state.error ? (
        <div className="mt-4">
          <Alert tone="danger">{state.error}</Alert>
        </div>
      ) : null}

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {industries.map((industry) => (
          <label
            key={industry.key}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-ink-200 px-4 py-3 text-sm hover:border-brand-300 has-checked:border-brand-500 has-checked:bg-brand-50"
          >
            <input
              type="radio"
              name="industryKey"
              value={industry.key}
              defaultChecked={industry.key === current}
              className="h-4 w-4 border-ink-300 text-brand-600 focus:ring-brand-600"
            />
            <span className="font-medium text-ink-800">{industry.name}</span>
          </label>
        ))}
      </div>

      <div className="mt-6">
        <Submit>Weiter</Submit>
      </div>
    </form>
  );
}

export function HoursStep({
  hours,
}: {
  hours: Array<{ weekday: number; startTime: string; endTime: string; isClosed: boolean }>;
}) {
  const [state, action] = useActionState<StepState, FormData>(saveHoursAction, {});
  const byWeekday = new Map(hours.map((entry) => [entry.weekday, entry]));

  return (
    <form action={action}>
      <h1 className="text-xl font-semibold text-ink-900">Arbeitszeiten</h1>
      <p className="mt-1 text-sm text-ink-500">Klarwerk schlägt nur Termine innerhalb dieser Zeiten vor.</p>
      {state.error ? (
        <div className="mt-4">
          <Alert tone="danger">{state.error}</Alert>
        </div>
      ) : null}

      <div className="mt-6 space-y-2">
        {[1, 2, 3, 4, 5, 6, 0].map((weekday) => {
          const entry = byWeekday.get(weekday);
          return (
            <div key={weekday} className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-200 px-4 py-2.5">
              <span className="w-28 text-sm font-medium text-ink-800">{WEEKDAYS[weekday]}</span>
              <input
                type="time"
                name={`start-${weekday}`}
                defaultValue={entry?.startTime ?? "08:00"}
                className="rounded-lg border-0 px-2 py-1 text-sm ring-1 ring-inset ring-ink-300"
              />
              <span className="text-ink-500">bis</span>
              <input
                type="time"
                name={`end-${weekday}`}
                defaultValue={entry?.endTime ?? "17:00"}
                className="rounded-lg border-0 px-2 py-1 text-sm ring-1 ring-inset ring-ink-300"
              />
              <label className="ml-auto flex items-center gap-2 text-sm text-ink-600">
                <input
                  type="checkbox"
                  name={`closed-${weekday}`}
                  defaultChecked={entry?.isClosed ?? (weekday === 0 || weekday === 6)}
                  className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-600"
                />
                geschlossen
              </label>
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <Submit>Weiter</Submit>
      </div>
    </form>
  );
}

export function MailboxStep({
  microsoftConfigured,
  googleConfigured,
  connected,
}: {
  microsoftConfigured: boolean;
  googleConfigured: boolean;
  connected: Array<{ providerKey: string; status: string }>;
}) {
  const isConnected = (key: string) => connected.some((entry) => entry.providerKey === key && entry.status === "CONNECTED");

  return (
    <div>
      <h1 className="text-xl font-semibold text-ink-900">Postfach verbinden</h1>
      <p className="mt-1 text-sm text-ink-500">
        Klarwerk liest neue Kundenanfragen aus Ihrem Postfach. Der Zugriff kann jederzeit widerrufen werden.
      </p>

      <div className="mt-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-200 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-ink-800">Microsoft 365 / Outlook</p>
            <p className="text-xs text-ink-500">
              {microsoftConfigured
                ? "Anmeldung über Ihr Microsoft-Konto."
                : "Nicht verfügbar: In dieser Installation sind keine Microsoft-Zugangsdaten hinterlegt."}
            </p>
          </div>
          {isConnected("microsoft365") ? (
            <Badge tone="success">verbunden</Badge>
          ) : microsoftConfigured ? (
            <Link href="/api/integrations/microsoft/start" className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Verbinden
            </Link>
          ) : (
            <Badge tone="neutral">nicht konfiguriert</Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-200 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-ink-800">Google Workspace / Gmail</p>
            <p className="text-xs text-ink-500">
              {googleConfigured
                ? "Anmeldung über Ihr Google-Konto."
                : "Nicht verfügbar: In dieser Installation sind keine Google-Zugangsdaten hinterlegt."}
            </p>
          </div>
          {isConnected("google") ? (
            <Badge tone="success">verbunden</Badge>
          ) : googleConfigured ? (
            <Link href="/api/integrations/google/start" className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Verbinden
            </Link>
          ) : (
            <Badge tone="neutral">nicht konfiguriert</Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-ink-300 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-ink-800">Demo-Postfach</p>
            <p className="text-xs text-ink-500">
              Zum Ausprobieren. Nachrichten werden gespeichert, aber nicht an einen Mailserver übergeben.
            </p>
          </div>
          {isConnected("demo") ? (
            <Badge tone="success">verbunden</Badge>
          ) : (
            <form action={connectDemoMailboxAction}>
              <Button type="submit" variant="secondary">
                Demo verwenden
              </Button>
            </form>
          )}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2">
        <form action={skipStepAction}>
          <input type="hidden" name="next" value={6} />
          <Submit>Weiter</Submit>
        </form>
        <SkipButton next={6} />
      </div>
    </div>
  );
}

export function CalendarStep() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-ink-900">Kalender verbinden</h1>
      <p className="mt-1 text-sm text-ink-500">
        Klarwerk plant Termine im eigenen Kalender. Wird ein Microsoft- oder Google-Konto verbunden, werden Termine
        zusätzlich dorthin übertragen.
      </p>
      <div className="mt-4">
        <Alert tone="info">
          Der Kalender in Klarwerk ist sofort einsatzbereit. Eine Kopplung mit Outlook oder Google Kalender richten Sie
          später unter Einstellungen › Integrationen ein.
        </Alert>
      </div>
      <div className="mt-6 flex items-center gap-2">
        <form action={skipStepAction}>
          <input type="hidden" name="next" value={7} />
          <Submit>Weiter</Submit>
        </form>
      </div>
    </div>
  );
}

export function CrmStep() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-ink-900">Bestehende Software anbinden</h1>
      <p className="mt-1 text-sm text-ink-500">Optional. Sie können diesen Schritt jetzt überspringen.</p>
      <div className="mt-4">
        <Alert tone="info">
          Anbindungen an Handwerkersoftware, CRM, ERP und DATEV werden über die Integrationsschnittstelle ergänzt. Bis
          dahin arbeitet Klarwerk eigenständig – Ihre Daten können jederzeit exportiert werden.
        </Alert>
      </div>
      <div className="mt-6 flex items-center gap-2">
        <form action={skipStepAction}>
          <input type="hidden" name="next" value={8} />
          <Submit>Weiter</Submit>
        </form>
        <SkipButton next={8} label="Überspringen" />
      </div>
    </div>
  );
}

const LEVELS = [
  {
    key: "SAFE",
    name: "Sicher",
    description: "Klarwerk macht ausschließlich Vorschläge. Nichts wird ohne Ihre Freigabe ausgeführt.",
    recommended: true,
  },
  {
    key: "ASSISTED",
    name: "Assistiert",
    description: "Klarwerk führt Aktionen mit mittlerem Risiko nach Freigabe aus. Versand und Buchungen bleiben freigabepflichtig.",
  },
  {
    key: "AUTOMATIC",
    name: "Automatisch",
    description: "Klarwerk darf festgelegte Aktionen selbstständig ausführen. E-Mail-Versand bleibt weiterhin freigabepflichtig, solange Sie das nicht ändern.",
  },
];

export function AutomationStep({ current }: { current: string }) {
  const [state, action] = useActionState<StepState, FormData>(finishOnboardingAction, {});
  return (
    <form action={action}>
      <h1 className="text-xl font-semibold text-ink-900">Wie selbstständig soll Klarwerk arbeiten?</h1>
      <p className="mt-1 text-sm text-ink-500">Die Voreinstellung ist bewusst zurückhaltend. Sie können sie jederzeit ändern.</p>
      {state.error ? (
        <div className="mt-4">
          <Alert tone="danger">{state.error}</Alert>
        </div>
      ) : null}

      <div className="mt-6 space-y-2">
        {LEVELS.map((level) => (
          <label
            key={level.key}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink-200 px-4 py-3 hover:border-brand-300 has-checked:border-brand-500 has-checked:bg-brand-50"
          >
            <input
              type="radio"
              name="automationLevel"
              value={level.key}
              defaultChecked={level.key === (current || "SAFE")}
              className="mt-0.5 h-4 w-4 border-ink-300 text-brand-600 focus:ring-brand-600"
            />
            <span>
              <span className="flex items-center gap-2 text-sm font-medium text-ink-900">
                {level.name}
                {level.recommended ? <Badge tone="brand">empfohlen</Badge> : null}
              </span>
              <span className="mt-0.5 block text-sm text-ink-600">{level.description}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="mt-6">
        <Submit>Einrichtung abschließen</Submit>
      </div>
    </form>
  );
}

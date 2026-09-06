"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveSettingsAction, type SettingsState } from "./actions";
import { Alert, Button, Field, inputClass } from "@/components/ui";

const TONES = [
  { key: "professional", label: "Professionell" },
  { key: "friendly", label: "Freundlich" },
  { key: "short", label: "Kurz und sachlich" },
  { key: "casual", label: "Locker" },
];

const LEVELS = [
  { key: "SAFE", label: "Sicher – nur Vorschläge" },
  { key: "ASSISTED", label: "Assistiert – Ausführung nach Freigabe" },
  { key: "AUTOMATIC", label: "Automatisch – festgelegte Aktionen selbstständig" },
];

const THRESHOLDS: ReadonlyArray<{
  name: "minConfidenceCustomerMatch" | "minConfidenceCategory" | "minConfidencePriority" | "minConfidenceExtraction";
  label: string;
  hint?: string;
}> = [
  { name: "minConfidenceCustomerMatch", label: "Kundenzuordnung", hint: "Darunter fragt Klarwerk nach." },
  { name: "minConfidenceCategory", label: "Einordnung der Nachricht" },
  { name: "minConfidencePriority", label: "Priorität" },
  { name: "minConfidenceExtraction", label: "Ausgelesene Angaben" },
];

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird gespeichert …" : "Speichern"}
    </Button>
  );
}

export function SettingsForm({
  initial,
  canWrite,
}: {
  canWrite: boolean;
  initial: {
    emailTone: string;
    emailSignature: string;
    companyVoice: string;
    automationLevel: string;
    minConfidenceCustomerMatch: number;
    minConfidenceCategory: number;
    minConfidencePriority: number;
    minConfidenceExtraction: number;
    approvalPolicy: Record<string, string>;
  };
}) {
  const [state, action] = useActionState<SettingsState, FormData>(saveSettingsAction, {});

  return (
    <form action={action} className="space-y-6">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tonfall in Antworten">
          <select name="emailTone" defaultValue={initial.emailTone} className={inputClass} disabled={!canWrite}>
            {TONES.map((tone) => (
              <option key={tone.key} value={tone.key}>
                {tone.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Selbstständigkeit">
          <select name="automationLevel" defaultValue={initial.automationLevel} className={inputClass} disabled={!canWrite}>
            {LEVELS.map((level) => (
              <option key={level.key} value={level.key}>
                {level.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Signatur" hint="Wird unter jede Antwort gesetzt.">
        <textarea name="emailSignature" rows={4} defaultValue={initial.emailSignature} className={inputClass} disabled={!canWrite} />
      </Field>

      <Field label="Sprachregeln des Betriebs" hint={'z. B. \u201EWir siezen.\u201C oder \u201EKeine Preise ohne Aufma\u00DF.\u201C'}>
        <textarea name="companyVoice" rows={3} defaultValue={initial.companyVoice} className={inputClass} disabled={!canWrite} />
      </Field>

      <div>
        <p className="mb-2 text-sm font-medium text-ink-700">Ab wann muss ein Mensch prüfen?</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {THRESHOLDS.map((threshold) => (
            <Field key={threshold.name} label={threshold.label} hint={threshold.hint}>
              <input
                type="number"
                name={threshold.name}
                min={0}
                max={1}
                step={0.05}
                defaultValue={initial[threshold.name]}
                className={inputClass}
                disabled={!canWrite}
              />
            </Field>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-ink-700">Freigabepflicht nach Risiko</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { name: "policyLow", label: "Geringes Risiko", hint: "Einordnen, auslesen, zusammenfassen" },
            { name: "policyMedium", label: "Mittleres Risiko", hint: "Auftrag anlegen, Termin vorschlagen" },
            { name: "policyHigh", label: "Hohes Risiko", hint: "E-Mail senden, Termin buchen" },
          ].map((entry) => (
            <Field key={entry.name} label={entry.label} hint={entry.hint}>
              <select
                name={entry.name}
                defaultValue={initial.approvalPolicy[entry.name === "policyLow" ? "LOW" : entry.name === "policyMedium" ? "MEDIUM" : "HIGH"] ?? "approve"}
                className={inputClass}
                disabled={!canWrite}
              >
                <option value="auto">ohne Freigabe</option>
                <option value="approve">Freigabe nötig</option>
              </select>
            </Field>
          ))}
        </div>
      </div>

      {canWrite ? <Save /> : <Alert tone="info">Ihre Rolle darf Einstellungen ansehen, aber nicht ändern.</Alert>}
    </form>
  );
}

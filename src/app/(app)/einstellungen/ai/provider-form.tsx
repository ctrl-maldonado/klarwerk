"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveAIProviderAction, setActiveAIProviderAction, type SettingsState } from "../actions";
import { Alert, Button, Field, inputClass } from "@/components/ui";
import { AI_KEY_PROVIDERS, AI_PROVIDER_LIST, AI_PROVIDERS } from "@/modules/ai/provider-catalog";

export interface ProviderInitial {
  model: string;
  baseUrl: string;
  hasKey: boolean;
  isDefault: boolean;
  scope: { emailContent: boolean; customerData: boolean; attachments: boolean };
}

function Save({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Wird gespeichert …" : label}
    </Button>
  );
}

/** Wechselt den aktiven Anbieter – unabhängig davon, ob ein Schlüssel neu eingegeben wird. */
export function ActiveProviderForm({
  activeProviderKey,
  providers,
}: {
  activeProviderKey: string;
  providers: Record<string, ProviderInitial>;
}) {
  const [state, action] = useActionState<SettingsState, FormData>(setActiveAIProviderAction, {});

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <Field label="Aktiver Anbieter" hint="Bestimmt, welches Modell die Anfragen bearbeitet.">
        <select name="providerKey" defaultValue={activeProviderKey} className={inputClass}>
          {AI_PROVIDER_LIST.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}
              {entry.requiresKey && !providers[entry.key]?.hasKey ? " – kein Schlüssel hinterlegt" : ""}
            </option>
          ))}
        </select>
      </Field>

      <Save label="Anbieter übernehmen" />
    </form>
  );
}

/** Zugangsdaten je Anbieter. Der Schlüssel wird verschlüsselt gespeichert (§30). */
export function AIProviderForm({
  providers,
  defaultProviderKey,
}: {
  providers: Record<string, ProviderInitial>;
  defaultProviderKey: string;
}) {
  const [state, action] = useActionState<SettingsState, FormData>(saveAIProviderAction, {});
  const [providerKey, setProviderKey] = useState(defaultProviderKey);

  const catalog = AI_PROVIDERS[providerKey] ?? AI_KEY_PROVIDERS[0];
  const initial = providers[providerKey] ?? {
    model: catalog.defaultModel,
    baseUrl: "",
    hasKey: false,
    isDefault: false,
    scope: { emailContent: true, customerData: true, attachments: false },
  };

  return (
    <form action={action} className="space-y-4" key={providerKey}>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Anbieter" hint={catalog.hint}>
          <select
            name="providerKey"
            value={providerKey}
            onChange={(event) => setProviderKey(event.target.value)}
            className={inputClass}
          >
            {AI_KEY_PROVIDERS.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Modell">
          <input
            name="model"
            defaultValue={initial.model || catalog.defaultModel}
            list={`models-${providerKey}`}
            className={inputClass}
          />
          <datalist id={`models-${providerKey}`}>
            {catalog.models.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </Field>
      </div>

      <Field label="Abweichende Adresse (optional)" hint="Für kompatible Anbieter oder EU-Endpunkte.">
        <input
          name="baseUrl"
          defaultValue={initial.baseUrl}
          className={inputClass}
          placeholder={catalog.baseUrlPlaceholder}
        />
      </Field>

      <Field
        label="API-Schlüssel"
        hint={
          initial.hasKey
            ? "Ein Schlüssel ist hinterlegt. Leer lassen, um ihn beizubehalten."
            : "Wird verschlüsselt gespeichert und nie an den Browser ausgeliefert."
        }
      >
        <input
          name="apiKey"
          type="password"
          autoComplete="off"
          className={inputClass}
          placeholder={initial.hasKey ? "••••••••" : catalog.keyPlaceholder}
        />
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-700">Welche Daten dürfen übertragen werden?</legend>
        <div className="space-y-1.5 text-sm">
          {[
            { name: "scope.emailContent", label: "Inhalt eingehender Nachrichten", checked: initial.scope.emailContent },
            { name: "scope.customerData", label: "Name und Adresse des Kunden", checked: initial.scope.customerData },
            { name: "scope.attachments", label: "Anhänge und Dokumente", checked: initial.scope.attachments },
          ].map((entry) => (
            <label key={entry.name} className="flex items-center gap-2 text-ink-700">
              <input
                type="checkbox"
                name={entry.name}
                defaultChecked={entry.checked}
                className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-600"
              />
              {entry.label}
            </label>
          ))}
          <p className="text-xs text-ink-500">Zahlungsdaten werden grundsätzlich nicht übertragen.</p>
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm text-ink-700">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={initial.isDefault || !initial.hasKey}
          className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-600"
        />
        Als aktiven Anbieter verwenden
      </label>
      <p className="text-xs text-ink-500">
        Ein neu eingegebener Schlüssel aktiviert diesen Anbieter in jedem Fall.
      </p>

      <Save label="Zugang speichern" />
    </form>
  );
}

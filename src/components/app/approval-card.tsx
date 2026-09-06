"use client";

import { Fragment, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { approveAction, rejectAction, type ApprovalActionState } from "@/app/(app)/freigaben/actions";
import { Alert, Badge, Button, Card, CONFIDENCE_LOW, Field, inputClass } from "@/components/ui";
import { useToast } from "@/components/app/toast";
import { cn, formatDateTime, formatRelative, formatTime, toDateTimeLocal } from "@/lib/utils";

/** Ein Eingabefeld, das vor der Freigabe einen Schritt-Parameter überschreibt. */
export interface ApprovalInput {
  kind: "text" | "select" | "datetime";
  value: string;
  /** Schritte und Argumente, in die der Wert geschrieben wird. Mehrere, wenn
   *  dieselbe Angabe in mehreren Schritten steht – etwa die Anschrift in
   *  Auftrag und Kundenanlage. */
  targets: Array<{ actionId: string; arg: string }>;
  options?: Array<{ value: string; label: string }>;
  /** Beschriftung, wenn mehrere Felder in einer Zeile stehen. */
  label?: string;
  width?: "full" | "medium" | "short";
}

export interface ApprovalFact {
  label: string;
  value: string;
  /** Angabe, die Klarwerk selbst als unsicher gemeldet hat. */
  uncertain?: boolean;
  /** Leer, wenn die Angabe nur abgeleitet ist und nichts zu überschreiben hat. */
  inputs?: ApprovalInput[];
}

export interface ApprovalSource {
  id: string;
  fromName: string;
  fromEmail: string;
  toEmails: string[];
  subject: string;
  receivedAt: string;
  bodyText: string;
  attachments: Array<{ id: string; filename: string; mimeType: string }>;
}

export interface ApprovalView {
  id: string;
  title: string;
  summary: string;
  facts: ApprovalFact[];
  status: string;
  /** Schritte eines vorherigen Versuchs, die nicht durchgelaufen sind. */
  failures: string[];
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  createdAt: string;
  demoMode: boolean;
  lowConfidence: string[];
  reply?: { subject: string; body: string } | null;
  actions: Array<{
    id: string;
    actionKey: string;
    label: string;
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    confidence?: number | null;
    optional?: boolean;
  }>;
  activity: Array<{ message: string; level: string }>;
  /** Die Nachricht, aus der der Vorschlag entstanden ist. */
  source?: ApprovalSource | null;
  sourceLink?: string | null;
}

const RISK_LABELS: Record<string, string> = { LOW: "geringes Risiko", MEDIUM: "Freigabe nötig", HIGH: "Freigabe zwingend" };

/* Ab dieser Länge wird die Nachricht gekürzt gezeigt. Sie bleibt sichtbar –
   nur der Rest kommt auf Anforderung, damit eine lange Mail nicht die
   Schaltflächen der Freigabe aus dem Bild schiebt. */
const PREVIEW_CHARS = 700;

/** Kennung eines Feldes: der erste Zielschritt samt Argument. */
function inputKey(input: ApprovalInput): string {
  return `${input.targets[0].actionId}.${input.targets[0].arg}`;
}

/* Termine kommen als ISO-Zeitstempel und müssen für <input type="datetime-local">
   in Ortszeit vorliegen – über toISOString wäre der Termin im Feld um den
   Zonenversatz verschoben. */
function toFieldValue(input: ApprovalInput): string {
  if (input.kind !== "datetime") return input.value;
  return input.value ? toDateTimeLocal(input.value) : "";
}

/** Die geänderte Angabe in der Anzeigezeile, damit sie nach dem Zuklappen den
 *  neuen Stand zeigt und nicht mehr den Vorschlag. */
function factValue(fact: ApprovalFact, values: Record<string, string>, initial: Record<string, string>): string {
  const inputs = (fact.inputs ?? []).filter((input) => input.targets.length);
  const read = (input: ApprovalInput) => values[inputKey(input)] ?? initial[inputKey(input)] ?? "";

  /* Beginn und Ende eines Termins gehören als Zeitraum zusammen. Einzeln
     hintereinander stünde das Datum zweimal in derselben Zeile. */
  const times = inputs.filter((input) => input.kind === "datetime");
  if (times.length === 2 && inputs.length === 2) {
    const start = read(times[0]);
    const end = read(times[1]);
    if (start && end) {
      const sameDay = start.slice(0, 10) === end.slice(0, 10);
      return sameDay
        ? `${formatDateTime(start)}–${formatTime(end)} Uhr`
        : `${formatDateTime(start)} – ${formatDateTime(end)} Uhr`;
    }
  }

  const shown = inputs.map((input) => {
    const key = inputKey(input);
    const value = values[key] ?? initial[key] ?? "";
    if (input.kind === "select") {
      return input.options?.find((option) => option.value === value)?.label ?? value;
    }
    if (input.kind === "datetime") {
      return value ? formatDateTime(value) : "";
    }
    return value;
  });
  return shown.filter(Boolean).join(" · ") || fact.value;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-2 text-xs font-semibold text-ink-500">{children}</h4>;
}

/* Die eingegangene Nachricht, vollständig lesbar neben dem Vorschlag.
   Geprüft wird durch Vergleichen: Vorher stand hier nur ein Verweis, und die
   Entscheidung fiel auf Angaben, deren Quelle auf einer anderen Seite lag. */
export function SourceMessage({ source }: { source: ApprovalSource }) {
  const [expanded, setExpanded] = useState(false);
  const long = source.bodyText.length > PREVIEW_CHARS;
  const shown = long && !expanded ? `${source.bodyText.slice(0, PREVIEW_CHARS).trimEnd()} …` : source.bodyText;

  return (
    <section className="px-5 py-3">
      <SectionTitle>Eingegangene Nachricht</SectionTitle>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-sm">
        <dt className="text-ink-500">Von</dt>
        <dd className="min-w-0 truncate text-ink-800" title={`${source.fromName} <${source.fromEmail}>`}>
          {source.fromName ? `${source.fromName} ` : ""}
          <span className="text-ink-600">&lt;{source.fromEmail}&gt;</span>
        </dd>

        {source.toEmails.length ? (
          <>
            <dt className="text-ink-500">An</dt>
            <dd className="min-w-0 truncate text-ink-600" title={source.toEmails.join(", ")}>
              {source.toEmails.join(", ")}
            </dd>
          </>
        ) : null}

        <dt className="text-ink-500">Eingang</dt>
        <dd className="text-ink-600" data-numeric>
          {formatDateTime(source.receivedAt)}
        </dd>

        <dt className="text-ink-500">Betreff</dt>
        <dd className="font-medium text-ink-900">{source.subject || "(kein Betreff)"}</dd>
      </dl>

      <p className="mt-3 max-w-[65ch] whitespace-pre-line border-t border-ink-100 pt-3 text-sm leading-relaxed text-ink-700">
        {shown}
      </p>

      {long ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 min-h-8 text-sm font-medium text-brand-700 hover:underline"
        >
          {expanded ? "Nachricht kürzen" : "Ganze Nachricht anzeigen"}
        </button>
      ) : null}

      {source.attachments.length ? (
        <div className="mt-3 border-t border-ink-100 pt-3">
          <SectionTitle>
            {source.attachments.length} {source.attachments.length === 1 ? "Anhang" : "Anhänge"}
          </SectionTitle>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-ink-700">
            {source.attachments.map((attachment) => (
              <li key={attachment.id}>
                {attachment.filename} <span className="text-xs text-ink-500">({attachment.mimeType})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function ApprovalCard({
  approval,
  /** Wohin nach der Entscheidung. Auf der Seite eines einzelnen Vorgangs bleibt
   *  sonst eine Karte stehen, die nichts mehr zu entscheiden hat. */
  redirectTo,
  /** Aus, wenn die Seitenüberschrift den Titel schon trägt. Zweimal derselbe
   *  Satz untereinander kostet nur die Zeile, die unten für die Schaltflächen
   *  fehlt. */
  showTitle = true,
}: {
  approval: ApprovalView;
  redirectTo?: string;
  showTitle?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [decided, setDecided] = useState(false);
  /* Der laufende Vorgang wird hier selbst gehalten statt über useFormStatus:
     die Freigabe-Schaltfläche steht über `form=` neben dem Formular und liegt
     damit außerhalb, wo der Hook nichts mehr sieht. */
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const formId = useId();

  /* Die Angaben aus "Das hat Klarwerk verstanden" sind die Argumente der
     vorgemerkten Schritte. Sie werden hier gehalten, damit eine Korrektur die
     Zuklappen-Grenze übersteht, und beim Freigeben als Überschreibung mitgehen. */
  const [correcting, setCorrecting] = useState(false);
  const initial = useMemo(() => {
    const map: Record<string, string> = {};
    for (const fact of approval.facts) {
      for (const input of fact.inputs ?? []) {
        if (input.targets.length) map[inputKey(input)] = toFieldValue(input);
      }
    }
    return map;
  }, [approval.facts]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const editable = approval.facts.some((fact) => (fact.inputs ?? []).some((input) => input.targets.length));

  /* Verschiebt jemand den Beginn, wandert das Ende um dieselbe Spanne mit.
     Sonst entstünde beim Vorziehen eines Termins ein Ende vor dem Anfang – der
     Kalender nimmt das an und der Eintrag wäre unbrauchbar. */
  function changeField(fact: ApprovalFact, input: ApprovalInput, next: string) {
    const key = inputKey(input);
    setValues((current) => {
      const updated = { ...current, [key]: next };
      if (input.kind !== "datetime" || input.targets[0].arg !== "start") return updated;

      const endInput = (fact.inputs ?? []).find(
        (entry) => entry.kind === "datetime" && entry.targets[0]?.arg === "end",
      );
      if (!endInput) return updated;

      const endKey = inputKey(endInput);
      const before = new Date(current[key]);
      const after = new Date(next);
      const end = new Date(current[endKey]);
      if (Number.isNaN(before.getTime()) || Number.isNaN(after.getTime()) || Number.isNaN(end.getTime())) {
        return updated;
      }
      const shifted = new Date(end.getTime() + (after.getTime() - before.getTime()));
      return { ...updated, [endKey]: toDateTimeLocal(shifted) };
    });
  }

  const overrides = useMemo(() => {
    const entries: Array<{ name: string; value: string }> = [];
    for (const fact of approval.facts) {
      for (const input of fact.inputs ?? []) {
        if (!input.targets.length) continue;
        const key = inputKey(input);
        const value = values[key] ?? "";
        if (value === initial[key]) continue;
        for (const target of input.targets) {
          entries.push({ name: `override.${target.actionId}.${target.arg}`, value });
        }
      }
    }
    return entries;
  }, [approval.facts, values, initial]);
  const [selected, setSelected] = useState<string[]>(
    approval.actions.filter((entry) => !entry.optional).map((entry) => entry.id),
  );

  const router = useRouter();
  const { toast } = useToast();

  /* Die Server Action ruft revalidatePath auf. Dadurch fällt dieser Vorgang aus
     der Liste und die Karte wird im selben Commit abgehängt – ein Effekt in der
     Karte käme nie zur Ausführung. Die Meldung wird deshalb hier ausgelöst:
     diese Funktion läuft zu Ende, auch wenn die Karte längst weg ist, und der
     ToastProvider liegt in der Shell und bleibt stehen. */
  async function handleApprove(formData: FormData) {
    setBusy("approve");
    const result: ApprovalActionState = await approveAction({}, formData);
    setBusy(null);
    if (result.error) {
      toast({
        tone: "error",
        title: "Freigabe nicht vollständig ausgeführt",
        detail: result.error,
        items: (result.results ?? []).filter((entry) => !entry.ok).map((entry) => entry.summary),
      });
      return;
    }
    setDecided(true);
    toast({
      tone: "success",
      title: approval.title,
      detail: result.success ?? "Freigegeben und ausgeführt.",
      items: (result.results ?? []).map((entry) => entry.summary),
    });
    if (redirectTo) router.push(redirectTo);
  }

  async function handleReject(formData: FormData) {
    setBusy("reject");
    const result: ApprovalActionState = await rejectAction({}, formData);
    setBusy(null);
    if (result.error) {
      toast({ tone: "error", title: "Ablehnung nicht gespeichert", detail: result.error });
      return;
    }
    setDecided(true);
    toast({ tone: "info", title: approval.title, detail: result.success ?? "Vorschlag abgelehnt." });
    if (redirectTo) router.push(redirectTo);
  }

  const skipped = approval.actions.length - selected.length;
  const retry = approval.status === "FAILED";

  return (
    <Card>
      <div className="border-b border-ink-200 px-5 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {showTitle ? <h3 className="text-sm font-semibold text-ink-900">{approval.title}</h3> : null}
            {retry ? (
              <Badge tone="danger">Ausführung abgebrochen</Badge>
            ) : (
              <Badge tone={approval.riskLevel === "HIGH" ? "danger" : "warning"}>{RISK_LABELS[approval.riskLevel]}</Badge>
            )}
            {approval.demoMode ? <Badge tone="neutral">Demo-Modus</Badge> : null}
            <span className="text-xs text-ink-500">
              Vorbereitet {formatRelative(approval.createdAt)} · {approval.actions.length}{" "}
              {approval.actions.length === 1 ? "Schritt" : "Schritte"}
            </span>
          </div>
          {approval.sourceLink ? (
            <Link href={approval.sourceLink} className="text-sm font-medium text-brand-700 hover:underline">
              Nachricht öffnen
            </Link>
          ) : null}
        </div>

        {retry ? (
          <div className="mt-2">
            <Alert tone="danger" title="Ein früherer Versuch ist steckengeblieben">
              {approval.failures.length ? (
                <ul className="list-disc space-y-0.5 pl-5">
                  {approval.failures.map((entry, index) => (
                    <li key={index}>{entry}</li>
                  ))}
                </ul>
              ) : (
                "Die freigegebenen Schritte wurden nicht vollständig ausgeführt."
              )}
              <p className="mt-1">Bereits erledigte Schritte hier abwählen, dann erneut ausführen.</p>
            </Alert>
          </div>
        ) : null}

        {/* Die unsicheren Angaben stehen zusätzlich an der betroffenen Zeile und
            am Vertrauensbalken. Hier reicht deshalb eine Zeile statt eines
            Kastens mit eigener Überschrift – die Höhe fehlt sonst unten bei den
            Schaltflächen. */}
        {approval.lowConfidence.length ? (
          <p className="mt-2 text-xs text-amber-800">
            Bitte prüfen: {approval.lowConfidence.join(", ")}.
          </p>
        ) : null}
      </div>

      {/* Nachricht und Vorschlag nebeneinander: geprüft wird durch Vergleichen,
          und dafür müssen beide Seiten gleichzeitig im Bild stehen. Unter der
          Umbruchbreite stapeln sie, Nachricht zuerst. */}
      <div className={cn("grid", approval.source ? "lg:grid-cols-2 lg:divide-x lg:divide-ink-200" : null)}>
        {approval.source ? <SourceMessage source={approval.source} /> : null}

        {/* Der Entscheidungsteil bleibt stehen, wenn die Nachricht länger ist
            als das Fenster: die Zelle läuft mit (damit die Trennlinie durchgeht),
            der Inhalt darin haftet oben. Deshalb darf die Karte selbst nicht
            clippen – `overflow: hidden` an einer übergeordneten Ebene setzt
            `position: sticky` außer Kraft. */}
        <div className={cn("min-w-0", approval.source ? "border-t border-ink-200 lg:border-t-0" : null)}>
          <div className="lg:sticky lg:top-4">
          <form action={handleApprove} id={formId}>
            <input type="hidden" name="approvalId" value={approval.id} />

            <section className="px-5 py-3">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h4 className="text-xs font-semibold text-ink-500">Das hat Klarwerk verstanden</h4>
                {/* Korrigieren steht hinter einem Schalter: Eingabefelder sind
                    32 px hoch und hätten den Vorgang in der Grundansicht über
                    den unteren Fensterrand geschoben. Geprüft wird häufiger als
                    korrigiert. */}
                {editable ? (
                  <button
                    type="button"
                    onClick={() => setCorrecting((value) => !value)}
                    className="shrink-0 text-xs font-medium text-brand-700 hover:underline"
                  >
                    {correcting ? "Angaben schließen" : "Angaben ändern"}
                  </button>
                ) : null}
              </div>

              {approval.facts.length ? (
                <dl className="grid grid-cols-[max-content_1fr] items-center gap-x-3 gap-y-0.5 text-sm">
                  {approval.facts.map((fact) => {
                    const inputs = (fact.inputs ?? []).filter((input) => input.targets.length);
                    const changed = inputs.some((input) => values[inputKey(input)] !== initial[inputKey(input)]);
                    const shown = changed ? factValue(fact, values, initial) : fact.value;
                    return (
                      <Fragment key={fact.label}>
                        <dt className="text-ink-500">{fact.label}</dt>
                        <dd className="min-w-0 text-ink-800">
                          {correcting && inputs.length ? (
                            <div className="flex flex-wrap items-center gap-1.5 py-0.5">
                              {inputs.map((input) => {
                                const key = inputKey(input);
                                const id = `${formId}-${key}`;
                                const width =
                                  input.width === "short" ? "w-20" : input.width === "medium" ? "w-36" : "min-w-[12rem] flex-1";
                                return (
                                  <Fragment key={key}>
                                    <label htmlFor={id} className="sr-only">
                                      {input.label ?? fact.label}
                                    </label>
                                    {input.kind === "select" ? (
                                      <select
                                        id={id}
                                        value={values[key] ?? ""}
                                        onChange={(event) => changeField(fact, input, event.target.value)}
                                        className={cn(inputClass, "w-36")}
                                      >
                                        {input.options?.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <input
                                        id={id}
                                        type={input.kind === "datetime" ? "datetime-local" : "text"}
                                        value={values[key] ?? ""}
                                        onChange={(event) => changeField(fact, input, event.target.value)}
                                        className={cn(inputClass, input.kind === "datetime" ? "w-52" : width)}
                                      />
                                    )}
                                  </Fragment>
                                );
                              })}
                            </div>
                          ) : (
                            /* Einzeilig abgeschnitten: der Auftragstitel ist die
                               ausformulierte Zeile aus der Nachricht und lief
                               über drei Zeilen. Vollständig steht er im Feld
                               und im title-Attribut. */
                            <div className="flex items-center gap-2">
                              <span className="min-w-0 truncate" title={shown}>
                                {shown}
                              </span>
                              {changed ? (
                                <Badge tone="info" className="shrink-0">
                                  geändert
                                </Badge>
                              ) : fact.uncertain ? (
                                <Badge tone="warning" className="shrink-0">
                                  prüfen
                                </Badge>
                              ) : null}
                            </div>
                          )}
                        </dd>
                      </Fragment>
                    );
                  })}
                </dl>
              ) : (
                <p className="max-w-[65ch] whitespace-pre-line text-sm text-ink-700">{approval.summary}</p>
              )}

              {/* Korrekturen gehen als versteckte Felder mit, auch wenn die
                  Eingabe wieder zugeklappt ist – sonst ginge eine Änderung beim
                  Freigeben verloren. Unveränderte Werte bleiben weg, damit ein
                  ungeprüfter Vorgang genau wie bisher ausgeführt wird. */}
              {overrides.map((entry) => (
                <input key={entry.name} type="hidden" name={entry.name} value={entry.value} />
              ))}
            </section>

            <div className="border-t border-ink-200 px-5 pb-1 pt-3">
              <SectionTitle>
                Diese Schritte werden ausgeführt
                {skipped ? ` (${selected.length} von ${approval.actions.length})` : null}
              </SectionTitle>
            </div>

            <div className="divide-y divide-ink-100">
              {approval.actions.map((entry) => {
                const active = selected.includes(entry.id);
                const low = typeof entry.confidence === "number" && entry.confidence * 100 < CONFIDENCE_LOW;
                return (
                  <label
                    key={entry.id}
                    className="flex cursor-pointer items-start gap-3 px-5 py-1.5 transition-colors hover:bg-ink-50"
                  >
                    <input
                      type="checkbox"
                      name="actionId"
                      value={entry.id}
                      checked={active}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked ? [...current, entry.id] : current.filter((id) => id !== entry.id),
                        )
                      }
                      className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-600"
                    />
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2">
                      <span className={cn("text-sm", active ? "font-medium text-ink-900" : "text-ink-500")}>
                        {entry.label}
                      </span>
                      {entry.riskLevel === "HIGH" ? <Badge tone="danger">hohes Risiko</Badge> : null}
                      {/* Das Vertrauen stand als eigener Balken unter jedem
                          Schritt und kostete vier Zeilen, die unten für die
                          Entscheidung fehlten. Es steht jetzt in derselben Zeile
                          und bekommt Farbe erst, wenn der Wert wirklich niedrig
                          ist – ein Wert von 80 % ist ein normaler Vorschlag. */}
                      {typeof entry.confidence === "number" ? (
                        <span className={cn("text-xs", low ? "font-medium text-amber-800" : "text-ink-500")} data-numeric>
                          {Math.round(entry.confidence * 100)} % Vertrauen
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>

            {approval.reply && editing ? (
              <div className="border-t border-ink-200 bg-ink-50 px-5 py-4">
                <SectionTitle>Antwortentwurf bearbeiten</SectionTitle>
                <Field label="Betreff" className="mb-2">
                  <input name="override.draft.subject" defaultValue={approval.reply.subject} className={inputClass} />
                </Field>
                <Field label="Nachricht">
                  <textarea name="override.draft.body" defaultValue={approval.reply.body} rows={10} className={inputClass} />
                </Field>
              </div>
            ) : approval.reply ? (
              // Der vollständige Entwurf ist beim Überfliegen selten nötig und
              // machte die Karte mehrere Bildschirme hoch. Betreff bleibt sichtbar,
              // der Text kommt auf Anforderung. "Bearbeiten" steht hier statt in
              // der Entscheidungsleiste: es gehört zum Entwurf, nicht zur Freigabe.
              <div className="border-t border-ink-200 bg-ink-50 px-5 py-2.5">
                <details>
                  <summary className="flex cursor-pointer list-none items-baseline gap-2">
                    <span className="shrink-0 text-xs font-semibold text-ink-500">Antwortentwurf</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{approval.reply.subject}</span>
                    <span className="shrink-0 text-xs text-brand-700 underline underline-offset-2">Text anzeigen</span>
                  </summary>
                  <p className="mt-2 max-w-[65ch] whitespace-pre-line text-sm text-ink-600">{approval.reply.body}</p>
                </details>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="mt-1 text-xs font-medium text-brand-700 hover:underline"
                >
                  Antwort bearbeiten
                </button>
              </div>
            ) : null}

          </form>

          {/* Zusagen und Ablehnen stehen in einer Leiste. Als zwei Zeilen
              untereinander kosteten sie die Höhe, die den Vorgang über den
              unteren Fensterrand schob – entschieden wird aber im Blick auf
              Nachricht und Vorschlag, nicht nach dem Scrollen. */}
          {!decided ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-ink-200 px-5 py-2">
              <Button type="submit" form={formId} disabled={busy !== null}>
                {busy === "approve" ? "Wird ausgeführt …" : retry ? "Erneut ausführen" : "Freigeben"}
              </Button>
              {/* Wie viele Schritte laufen, steht bereits in der Überschrift
                  der Liste ("3 von 4"). Ein zweiter Hinweis hier brach die
                  Leiste auf zwei Zeilen um. */}
              <form action={handleReject} className="ml-auto flex items-center gap-2">
                <input type="hidden" name="approvalId" value={approval.id} />
                <label htmlFor={`reject-note-${approval.id}`} className="sr-only">
                  Grund der Ablehnung (optional)
                </label>
                <input
                  id={`reject-note-${approval.id}`}
                  name="note"
                  placeholder="Grund (optional)"
                  className={cn(inputClass, "w-40")}
                />
                <Button type="submit" variant="danger" disabled={busy !== null}>
                  {busy === "reject" ? "Wird gespeichert …" : "Ablehnen"}
                </Button>
              </form>
            </div>
          ) : null}
          </div>
        </div>
      </div>

      {approval.activity.length ? (
        <details className="border-t border-ink-200 px-5 py-1.5">
          <summary className="cursor-pointer text-xs font-medium text-ink-500">
            Was Klarwerk gemacht hat ({approval.activity.length} Schritte)
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            {approval.activity.map((entry, index) => (
              <li
                key={index}
                className={cn("text-xs", entry.level === "warning" ? "text-amber-700" : entry.level === "error" ? "text-red-700" : "text-ink-500")}
              >
                {entry.message}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </Card>
  );
}

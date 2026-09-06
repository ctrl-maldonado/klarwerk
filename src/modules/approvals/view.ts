import type { ApprovalRequest, Email, EmailAttachment } from "@prisma/client";
import type { ApprovalFact, ApprovalSource, ApprovalView } from "@/components/app/approval-card";
import { PRIORITY_LABELS } from "@/modules/orders/service";
import { formatTime, formatWeekday } from "@/lib/utils";
import type { ProposedAction } from "./index";

/** Die Nachricht, aus der die Freigabe entstanden ist – samt Anhängen. */
export type ApprovalSourceEmail = Email & { attachments?: EmailAttachment[] };

/**
 * Die Angaben, die bisher als Fließtext in `summary` standen, einzeln – und wo
 * es geht als Eingabefeld.
 *
 * Beim Prüfen wird verglichen: steht in der Nachricht dasselbe, was Klarwerk
 * verstanden hat? Das geht mit ausgerichteten Zeilen deutlich schneller als mit
 * einem Absatz aus "Anliegen: … Kunde: … Priorität: …".
 *
 * Die Werte kommen bewusst aus den Argumenten der vorgemerkten Schritte und
 * nicht aus `context.extraction`: nur so ändert eine Korrektur auch wirklich
 * das, was ausgeführt wird. Jedes Feld nennt dafür die Schritte, in die es
 * geschrieben wird – die Freigabe kennt diesen Weg als `override.<Schritt>.<Feld>`
 * bereits vom Antwortentwurf.
 *
 * `summary` bleibt als Rückfalltext erhalten – für Freigaben aus der Zeit vor
 * dieser Struktur und für die Kurzfassung auf dem Dashboard.
 */
type ActionMap = Map<string, ProposedAction>;

/** Sammelt alle Schritte, die dieses Argument tragen. */
function targetsFor(actions: ProposedAction[], arg: string): Array<{ actionId: string; arg: string }> {
  return actions
    .filter((action) => Object.prototype.hasOwnProperty.call(action.args ?? {}, arg))
    .map((action) => ({ actionId: action.id, arg }));
}

function argOf(action: ProposedAction | undefined, arg: string): string {
  const value = action?.args?.[arg];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function toFacts(
  context: Record<string, any>,
  actions: ProposedAction[],
  source?: ApprovalSourceEmail | null,
): ApprovalFact[] {
  const extraction = (context.extraction as Record<string, any>) ?? {};
  const match = context.customerMatch as { customerId?: string; name?: string; confidence?: number } | undefined;
  const lowConfidence = (context.lowConfidence as string[]) ?? [];
  const uncertain = (needle: string) => lowConfidence.some((entry) => entry.startsWith(needle));

  const byKey: ActionMap = new Map();
  for (const action of actions) if (!byKey.has(action.actionKey)) byKey.set(action.actionKey, action);
  const order = byKey.get("create_order");
  const appointment = byKey.get("create_appointment");

  const facts: ApprovalFact[] = [];

  /* Anliegen ist der spätere Auftragstitel. Steht kein Auftrag an, bleibt die
     Zusammenfassung als reine Anzeige stehen. */
  if (order) {
    facts.push({
      label: "Anliegen",
      value: argOf(order, "title"),
      uncertain: uncertain("Datenextraktion"),
      inputs: [{ kind: "text", value: argOf(order, "title"), targets: [{ actionId: order.id, arg: "title" }] }],
    });
  } else if (extraction.summary || extraction.issue) {
    facts.push({ label: "Anliegen", value: String(extraction.summary || extraction.issue) });
  }

  if (match?.customerId) {
    facts.push({
      label: "Kunde",
      value: `${match.name ?? "Bestandskunde"} · Bestandskunde (${Math.round((match.confidence ?? 0) * 100)} %)`,
      uncertain: uncertain("Kundenzuordnung"),
    });
  } else if (extraction.customerName || extraction.companyName || source) {
    facts.push({
      label: "Kunde",
      value: `${extraction.companyName || extraction.customerName || source?.fromName || source?.fromEmail} · neu`,
      uncertain: uncertain("Kundenzuordnung"),
    });
  }

  /* Straße, PLZ und Ort stehen in Auftrag und Kundenanlage unter denselben
     Namen – die Korrektur geht deshalb an alle Schritte, die sie führen. */
  const street = targetsFor(actions, "street");
  if (street.length) {
    const zip = targetsFor(actions, "zip");
    const city = targetsFor(actions, "city");
    const values = {
      street: argOf(order ?? actions.find((a) => a.args?.street !== undefined), "street") || String(extraction.street ?? ""),
      zip: argOf(order ?? actions.find((a) => a.args?.zip !== undefined), "zip") || String(extraction.zip ?? ""),
      city: argOf(order ?? actions.find((a) => a.args?.city !== undefined), "city") || String(extraction.city ?? ""),
    };
    facts.push({
      label: "Anschrift",
      value: [values.street, [values.zip, values.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—",
      inputs: [
        { kind: "text", value: values.street, targets: street, label: "Straße und Hausnummer", width: "full" },
        { kind: "text", value: values.zip, targets: zip, label: "Postleitzahl", width: "short" },
        { kind: "text", value: values.city, targets: city, label: "Ort", width: "medium" },
      ],
    });
  }

  if (order) {
    const priority = argOf(order, "priority") || "NORMAL";
    facts.push({
      label: "Priorität",
      value: `${PRIORITY_LABELS[priority as keyof typeof PRIORITY_LABELS] ?? priority}${
        context.priorityEscalated ? " · durch Betriebsregel angehoben" : ""
      }`,
      inputs: [
        {
          kind: "select",
          value: priority,
          targets: [{ actionId: order.id, arg: "priority" }],
          options: Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label })),
        },
      ],
    });
  } else if (context.priority) {
    facts.push({
      label: "Priorität",
      value: PRIORITY_LABELS[context.priority as keyof typeof PRIORITY_LABELS] ?? String(context.priority),
    });
  }

  if (appointment) {
    const start = argOf(appointment, "start");
    const end = argOf(appointment, "end");
    facts.push({
      label: "Terminvorschlag",
      value: start
        ? `${formatWeekday(start)}, ${formatTime(start)}–${end ? formatTime(end) : "?"} Uhr${
            (context.slot as { employeeName?: string } | null)?.employeeName
              ? ` bei ${(context.slot as { employeeName?: string }).employeeName}`
              : ""
          }`
        : "—",
      inputs: [
        { kind: "datetime", value: start, targets: [{ actionId: appointment.id, arg: "start" }], label: "Beginn" },
        { kind: "datetime", value: end, targets: [{ actionId: appointment.id, arg: "end" }], label: "Ende" },
      ],
    });
  } else {
    const slot = context.slot as { start?: string; end?: string; employeeName?: string } | null | undefined;
    if (slot?.start && slot.end) {
      facts.push({
        label: "Terminvorschlag",
        value: `${formatWeekday(slot.start)}, ${formatTime(slot.start)}–${formatTime(slot.end)} Uhr${
          slot.employeeName ? ` bei ${slot.employeeName}` : ""
        }`,
      });
    }
  }

  return facts;
}

export function toApprovalSource(email: ApprovalSourceEmail): ApprovalSource {
  return {
    id: email.id,
    fromName: email.fromName,
    fromEmail: email.fromEmail,
    toEmails: email.toEmails,
    subject: email.subject,
    receivedAt: email.receivedAt.toISOString(),
    bodyText: email.bodyText,
    attachments: (email.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
    })),
  };
}

/**
 * @param source Die zugehörige Nachricht. Wird sie übergeben, steht sie in der
 *   Freigabekarte neben dem Vorschlag – ohne sie bleibt nur der Verweis.
 */
export function toApprovalView(approval: ApprovalRequest, source?: ApprovalSourceEmail | null): ApprovalView {
  const context = (approval.context as Record<string, any>) ?? {};
  const actions = (approval.proposedActions as unknown as ProposedAction[]) ?? [];

  /* Ein fehlgeschlagener Vorgang steht wieder zur Entscheidung an und sah
     bisher aus wie ein neuer. Die Karte braucht deshalb den Status und die
     Schritte, die nicht durchgelaufen sind. */
  const executed = (approval.executionResult as Array<{ summary: string; ok: boolean }> | null) ?? [];

  return {
    id: approval.id,
    title: approval.title,
    summary: approval.summary,
    facts: toFacts(context, actions, source),
    status: approval.status,
    failures: executed.filter((entry) => !entry.ok).map((entry) => entry.summary),
    riskLevel: approval.riskLevel,
    createdAt: approval.createdAt.toISOString(),
    demoMode: Boolean(context.demoMode),
    lowConfidence: (context.lowConfidence as string[]) ?? [],
    reply: context.reply ? { subject: context.reply.subject, body: context.reply.body } : null,
    actions: actions.map((action) => ({
      id: action.id,
      actionKey: action.actionKey,
      label: action.label,
      riskLevel: action.riskLevel,
      confidence: action.confidence ?? null,
      optional: action.optional,
    })),
    activity: ((context.activity as Array<{ message: string; level: string }>) ?? []).map((entry) => ({
      message: entry.message,
      level: entry.level,
    })),
    source: source ? toApprovalSource(source) : null,
    sourceLink: approval.sourceType === "email" && approval.sourceId ? `/emails/${approval.sourceId}` : null,
  };
}

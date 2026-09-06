import type { Email, RiskLevel, Workflow, WorkflowStep } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { tenantDb } from "@/lib/tenant-db";
import { formatDateTime, truncate } from "@/lib/utils";
import { getActionDefinition } from "@/modules/ai/action-catalog";
import { runAITask } from "@/modules/ai/service";
import { executeAction, type ToolContext } from "@/modules/ai/tools";
import { createApproval, type ProposedAction } from "@/modules/approvals";
import { writeAudit } from "@/modules/audit";
import { describeSlot, findAvailableSlots, type Slot } from "@/modules/calendar/scheduling";
import { customerDisplayName, findMatchingCustomers } from "@/modules/customers/service";
import { determinePriority, PRIORITY_LABELS } from "@/modules/orders/service";
import { notify } from "@/modules/notifications";
import { getTenantIndustryProfile } from "@/modules/tenants/provisioning";
import type { IndustryProfileDefinition } from "@/modules/industry/types";

const log = logger.child({ module: "workflow" });

export interface RunContext {
  tenantId: string;
  runId: string;
  email?: Email;
  profile: IndustryProfileDefinition;
  tenant: { name: string; automationLevel: string; industryKey: string };
  settings: {
    emailTone: string;
    emailSignature: string;
    companyVoice: string;
    minConfidenceCustomerMatch: number;
    minConfidenceCategory: number;
    minConfidencePriority: number;
    minConfidenceExtraction: number;
  };
  toolContext: ToolContext;

  classification?: { categoryKey: string; confidence: number; reason: string; isSpam: boolean };
  extraction?: Record<string, any>;
  priorityDecision?: { priority: string; reasons: string[]; escalated: boolean };
  customerMatch?: { customerId?: string; confidence: number; name?: string; reasons: string[] };
  slots?: Slot[];
  chosenSlot?: Slot;
  reply?: { subject: string; body: string; confidence: number };

  /** Ergebnisse bereits ausgeführter Schritte – Basis für $ref-Verweise. */
  /**
   * Ergebnisse, die sich mehrere Automationsläufe zur selben E-Mail teilen.
   * Ohne das ordnet jede auslösende Automation dieselbe Nachricht erneut ein –
   * gleicher Prompt, gleiches Ergebnis, zweite Rechnung und zweite Wartezeit.
   */
  shared: SharedEmailResults;

  results: Record<string, { data: any }>;
  /** Aktionen, die auf eine Freigabe warten. */
  proposed: ProposedAction[];
  activity: Array<{ at: string; message: string; level: "info" | "warning" | "error" }>;
  lowConfidence: string[];
  demoMode: boolean;
  stopped?: string;
}

/** Was sich Automationsläufe zur selben Nachricht teilen dürfen. */
export interface SharedEmailResults {
  emailId?: string;
  classification?: {
    categoryKey: string;
    confidence: number;
    reason: string;
    isSpam: boolean;
    isDemo: boolean;
  };
}

type StepHandler = (context: RunContext, step: WorkflowStep) => Promise<void>;

/** Titel beginnen mit einem Großbuchstaben, auch wenn der Satz mitten aus der Nachricht stammt. */
function toTitle(value: string, fallback: string): string {
  const trimmed = value.trim() || fallback.trim();
  if (!trimmed) return "Kundenanfrage";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function note(context: RunContext, message: string, level: "info" | "warning" | "error" = "info") {
  context.activity.push({ at: new Date().toISOString(), message, level });
}

function resolveArgs(args: Record<string, unknown>, results: Record<string, { data: any }>) {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string" && value.startsWith("$ref:")) {
      const [stepId, ...rest] = value.slice(5).split(".");
      let current: any = results[stepId]?.data;
      for (const segment of rest) current = current?.[segment];
      if (current !== undefined && current !== null) resolved[key] = current;
      continue;
    }
    if (value !== undefined && value !== null && value !== "") resolved[key] = value;
  }
  return resolved;
}

/**
 * Führt eine Aktion aus – oder merkt sie zur Freigabe vor.
 * Die Entscheidung trifft ausschließlich die Freigabepolitik des Betriebs (§17).
 */
async function stageOrExecute(
  context: RunContext,
  stepId: string,
  actionKey: string,
  args: Record<string, unknown>,
  label: string,
  options: { confidence?: number | null; optional?: boolean } = {},
): Promise<{ staged: boolean; data?: any }> {
  const definition = getActionDefinition(actionKey);
  const riskLevel: RiskLevel = definition?.riskLevel ?? "MEDIUM";

  const outcome = await executeAction(actionKey, resolveArgs(args, context.results), context.toolContext, "auto");

  if (outcome.staged) {
    context.proposed.push({
      id: stepId,
      actionKey,
      label,
      args,
      riskLevel,
      confidence: options.confidence ?? null,
      optional: options.optional ?? false,
      enabled: true,
    });
    note(context, `${label} – zur Freigabe vorbereitet.`);
    return { staged: true };
  }

  context.results[stepId] = { data: outcome.data };
  note(context, outcome.summary);
  return { staged: false, data: outcome.data };
}

/**
 * Protokolliert die Einordnung im Lauf und prüft die Vertrauensschwelle.
 * Gilt für die frisch berechnete wie für die übernommene Einordnung: Ob ein
 * Wert geprüft werden muss, entscheidet jeder Lauf für sich (§17).
 */
function applyClassification(
  context: RunContext,
  categories: Array<{ key: string; label: string }>,
  categoryKey: string,
  confidence: number,
  uebernommen: boolean,
): void {
  const label = categories.find((category) => category.key === categoryKey)?.label ?? categoryKey;
  const prozent = Math.round(confidence * 100);
  note(
    context,
    uebernommen
      ? `E-Mail eingeordnet als „${label}" (${prozent} % Vertrauen) – übernommen aus dem vorherigen Lauf zu dieser Nachricht.`
      : `E-Mail eingeordnet als „${label}" (${prozent} % Vertrauen).`,
  );

  if (confidence < context.settings.minConfidenceCategory) {
    context.lowConfidence.push(`Kategorie (${prozent} %)`);
    note(context, "Vertrauenswert unter der Schwelle – die Einordnung muss geprüft werden.", "warning");
  }
}

// ───────────────────────────── Schritt-Handler ─────────────────────────────

const STEP_HANDLERS: Record<string, StepHandler> = {
  async ai_classify_email(context) {
    const email = context.email;
    if (!email) throw new AppError("Dieser Schritt benötigt eine E-Mail.");

    const categories = await tenantDb(context.tenantId).emailCategory.findMany({ orderBy: { sortOrder: "asc" } });

    // Hat ein vorheriger Lauf dieselbe Nachricht schon eingeordnet, wird das
    // Ergebnis übernommen. Ein zweiter Modellaufruf mit identischem Prompt
    // liefert nichts Neues, kostet aber Zeit und Geld.
    const geteilt = context.shared.emailId === email.id ? context.shared.classification : undefined;
    if (geteilt) {
      context.demoMode = context.demoMode || geteilt.isDemo;
      context.classification = {
        categoryKey: geteilt.categoryKey,
        confidence: geteilt.confidence,
        reason: geteilt.reason,
        isSpam: geteilt.isSpam,
      };
      applyClassification(context, categories, geteilt.categoryKey, geteilt.confidence, true);
      return;
    }

    const outcome = await runAITask<{ categoryKey: string; confidence: number; reason: string; isSpam: boolean }>({
      tenantId: context.tenantId,
      promptKey: "email_classifier",
      entityType: "email",
      entityId: email.id,
      variables: {
        industryName: context.profile.name,
        industryInstructions: context.profile.aiInstructions.join("\n"),
        categories: categories.map((category) => `- ${category.key}: ${category.label} – ${category.aiHint}`).join("\n"),
        fromName: email.fromName,
        fromEmail: email.fromEmail,
        subject: email.subject,
        receivedAt: formatDateTime(email.receivedAt),
        body: email.bodyText,
      },
      context: {
        subject: email.subject,
        body: email.bodyText,
        categories: categories.map((category) => ({ key: category.key, label: category.label, aiHint: category.aiHint })),
      },
    });

    context.demoMode = context.demoMode || outcome.isDemo;
    const data = outcome.data;
    if (!data?.categoryKey) throw new AppError("Die Klassifikation lieferte kein Ergebnis.");

    context.classification = {
      categoryKey: data.categoryKey,
      confidence: data.confidence ?? 0,
      reason: data.reason ?? "",
      isSpam: Boolean(data.isSpam),
    };
    context.shared.emailId = email.id;
    context.shared.classification = { ...context.classification, isDemo: outcome.isDemo };

    const db = tenantDb(context.tenantId);
    await db.email.update({
      where: { id: email.id },
      data: { categoryKey: data.categoryKey, categoryConfidence: data.confidence ?? 0 },
    });
    // Mehrere Automationen können dieselbe Nachricht anfassen – ein bereits
    // erreichter Status (z. B. „wartet auf Freigabe") darf nicht zurückfallen.
    await db.email.updateMany({ where: { id: email.id, status: "RECEIVED" }, data: { status: "PROCESSING" } });

    applyClassification(context, categories, data.categoryKey, data.confidence ?? 0, false);
  },

  async ai_extract_request(context) {
    const email = context.email;
    if (!email) throw new AppError("Dieser Schritt benötigt eine E-Mail.");

    const customFields = await tenantDb(context.tenantId).customField.findMany({ where: { entityType: "order" } });

    const outcome = await runAITask<Record<string, any>>({
      tenantId: context.tenantId,
      promptKey: "request_extractor",
      entityType: "email",
      entityId: email.id,
      variables: {
        industryName: context.profile.name,
        industryInstructions: context.profile.aiInstructions.join("\n"),
        today: formatDateTime(new Date()),
        categories: context.profile.orderCategories
          .map((category) => `- ${category.key}: ${category.label}`)
          .join("\n"),
        customFields: customFields.length
          ? customFields.map((field) => `- ${field.key}: ${field.label}${field.aiHint ? ` (${field.aiHint})` : ""}`).join("\n")
          : "keine",
        fromName: email.fromName,
        fromEmail: email.fromEmail,
        subject: email.subject,
        body: email.bodyText,
      },
      context: {
        subject: email.subject,
        body: email.bodyText,
        fromName: email.fromName,
        fromEmail: email.fromEmail,
        orderCategories: context.profile.orderCategories,
        now: new Date().toISOString(),
      },
    });

    context.demoMode = context.demoMode || outcome.isDemo;
    const data = outcome.data;
    if (!data) throw new AppError("Die Extraktion lieferte kein Ergebnis.");
    context.extraction = data;

    // Sicherheitsregeln des Branchenprofils dürfen die Priorität nur anheben.
    const decision = determinePriority(
      `${email.subject}\n${email.bodyText}`,
      (data.priority as any) ?? "NORMAL",
      context.profile,
      data.categoryKey,
    );
    context.priorityDecision = decision;
    context.extraction.priority = decision.priority;

    note(
      context,
      `Anliegen erkannt: ${truncate(data.issue ?? data.summary ?? "", 120)} · Priorität ${decision.priority}${
        decision.escalated ? " (durch Betriebsregel angehoben)" : ""
      }.`,
    );

    if ((data.confidence ?? 0) < context.settings.minConfidenceExtraction) {
      context.lowConfidence.push(`Datenextraktion (${Math.round((data.confidence ?? 0) * 100)} %)`);
      note(context, "Die extrahierten Angaben sind unsicher und müssen geprüft werden.", "warning");
    }
    if (Array.isArray(data.missingInformation) && data.missingInformation.length) {
      note(context, `Fehlende Angaben: ${data.missingInformation.join(", ")}.`, "warning");
    }
  },

  async match_customer(context) {
    const extraction = context.extraction ?? {};
    const email = context.email;

    const matches = await findMatchingCustomers(context.tenantId, {
      name: extraction.customerName,
      companyName: extraction.companyName,
      email: extraction.email || email?.fromEmail,
      phone: extraction.phone,
      street: extraction.street,
      zip: extraction.zip,
    });

    const best = matches[0];
    if (best && best.confidence >= context.settings.minConfidenceCustomerMatch) {
      context.customerMatch = {
        customerId: best.customer.id,
        confidence: best.confidence,
        name: customerDisplayName(best.customer),
        reasons: best.reasons,
      };
      context.results.customer = { data: best.customer };
      note(context, `Bestandskunde erkannt: ${customerDisplayName(best.customer)} (${Math.round(best.confidence * 100)} %).`);
      if (email) {
        await tenantDb(context.tenantId).email.update({
          where: { id: email.id },
          data: { customerId: best.customer.id },
        });
      }
      return;
    }

    if (best) {
      context.customerMatch = {
        confidence: best.confidence,
        name: customerDisplayName(best.customer),
        reasons: best.reasons,
      };
      context.lowConfidence.push(`Kundenzuordnung (${Math.round(best.confidence * 100)} %)`);
      note(
        context,
        `Kein eindeutiger Treffer. Meinten Sie ${customerDisplayName(best.customer)}? (${Math.round(best.confidence * 100)} % Übereinstimmung)`,
        "warning",
      );
      return;
    }

    context.customerMatch = { confidence: 0, reasons: ["Kein passender Kunde in der Kundendatei."] };
    note(context, "Kein bestehender Kunde gefunden – ein neuer Kunde wird vorgeschlagen.");
  },

  async create_customer(context) {
    if (context.customerMatch?.customerId) return;
    const extraction = context.extraction ?? {};
    const email = context.email;
    const [firstName, ...rest] = String(extraction.customerName ?? "").split(" ").filter(Boolean);

    await stageOrExecute(
      context,
      "customer",
      "create_customer",
      {
        firstName: firstName ?? "",
        lastName: rest.join(" "),
        companyName: extraction.companyName ?? "",
        email: extraction.email || email?.fromEmail || "",
        phone: extraction.phone ?? "",
        street: extraction.street ?? "",
        zip: extraction.zip ?? "",
        city: extraction.city ?? "",
      },
      `Neuen Kunden anlegen: ${extraction.companyName || extraction.customerName || email?.fromEmail || "unbekannt"}`,
      { confidence: context.customerMatch?.confidence ?? 0 },
    );
  },

  async create_order(context) {
    const extraction = context.extraction ?? {};
    const email = context.email;
    const category = context.profile.orderCategories.find((entry) => entry.key === extraction.categoryKey);

    await stageOrExecute(
      context,
      "order",
      "create_order",
      {
        customerId: context.customerMatch?.customerId ?? "$ref:customer.id",
        title: truncate(toTitle(extraction.issue ?? "", email?.subject ?? ""), 120),
        description: email?.bodyText ?? "",
        categoryKey: extraction.categoryKey ?? "other",
        priority: context.priorityDecision?.priority ?? "NORMAL",
        street: extraction.street ?? "",
        zip: extraction.zip ?? "",
        city: extraction.city ?? "",
        aiSummary: extraction.summary ?? "",
        confidence: extraction.confidence ?? null,
        sourceEmailId: email?.id ?? "",
      },
      `Auftrag anlegen: ${truncate(toTitle(extraction.issue ?? "", email?.subject ?? ""), 60)} (${category?.label ?? "Sonstiges"})`,
      { confidence: extraction.confidence ?? null },
    );
  },

  async search_calendar(context) {
    const extraction = context.extraction ?? {};
    const category = context.profile.orderCategories.find((entry) => entry.key === extraction.categoryKey);
    const duration = Number(extraction.estimatedDurationMinutes) || category?.estimatedMinutes || 90;
    const preferredDate = extraction.requestedDate ? new Date(extraction.requestedDate) : null;

    const slots = await findAvailableSlots({
      tenantId: context.tenantId,
      durationMinutes: duration,
      requiredSkills: category?.requiredSkills ?? [],
      zip: extraction.zip,
      preferredDate: preferredDate && !Number.isNaN(preferredDate.getTime()) ? preferredDate : null,
      preferredDayPart: extraction.requestedTimeOfDay || "any",
      priority: (context.priorityDecision?.priority as any) ?? "NORMAL",
      limit: 5,
    });

    context.slots = slots;
    if (!slots.length) {
      note(context, "Im Kalender wurde kein passendes Zeitfenster gefunden – bitte manuell planen.", "warning");
      return;
    }
    note(context, `${slots.length} freie Zeitfenster gefunden, bester Vorschlag: ${describeSlot(slots[0])}.`);

    const outcome = await runAITask<{ slotId: string; reason: string; confidence: number }>({
      tenantId: context.tenantId,
      promptKey: "appointment_reasoner",
      entityType: "email",
      entityId: context.email?.id,
      variables: {
        issue: extraction.issue ?? "",
        priority: context.priorityDecision?.priority ?? "NORMAL",
        preference: [extraction.requestedDate, extraction.requestedTimeOfDay].filter(Boolean).join(" "),
        location: [extraction.street, extraction.zip, extraction.city].filter(Boolean).join(" "),
        slots: slots.map((slot) => `- ${slot.id}: ${describeSlot(slot)} (Bewertung ${slot.score})`).join("\n"),
      },
      context: {
        slots: slots.map((slot) => ({
          id: slot.id,
          start: slot.start.toISOString(),
          employeeName: slot.employeeName,
          score: slot.score,
        })),
      },
    }).catch((error) => {
      note(context, `Terminauswahl über das Modell nicht möglich (${error.message}) – bester Kalendervorschlag wird verwendet.`, "warning");
      return null;
    });

    context.demoMode = context.demoMode || Boolean(outcome?.isDemo);
    const chosen = slots.find((slot) => slot.id === outcome?.data?.slotId) ?? slots[0];
    context.chosenSlot = chosen;
    if (outcome?.data?.reason) note(context, `Terminwahl: ${outcome.data.reason}`);
  },

  async create_appointment(context) {
    const slot = context.chosenSlot;
    if (!slot) return;
    const extraction = context.extraction ?? {};

    await stageOrExecute(
      context,
      "appointment",
      "create_appointment",
      {
        orderId: "$ref:order.id",
        customerId: context.customerMatch?.customerId ?? "$ref:customer.id",
        employeeId: slot.employeeId,
        title: truncate(toTitle(extraction.issue ?? "", "Kundeneinsatz"), 100),
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        location: [extraction.street, `${extraction.zip ?? ""} ${extraction.city ?? ""}`.trim()].filter(Boolean).join(", "),
      },
      `Termin vorschlagen: ${describeSlot(slot)}`,
      { confidence: 0.8 },
    );
  },

  async draft_email(context) {
    const email = context.email;
    if (!email) return;
    const extraction = context.extraction ?? {};

    const outcome = await runAITask<{ subject: string; body: string; confidence: number }>({
      tenantId: context.tenantId,
      promptKey: "email_reply",
      entityType: "email",
      entityId: email.id,
      variables: {
        companyName: context.tenant.name,
        tone: context.settings.emailTone,
        companyVoice: context.settings.companyVoice,
        customerName: context.customerMatch?.name ?? extraction.customerName ?? "",
        originalMessage: email.bodyText,
        issue: extraction.issue ?? "",
        appointmentText: context.chosenSlot ? describeSlot(context.chosenSlot) : "",
        missingInformation: (extraction.missingInformation ?? []).join(", "),
        signature: context.settings.emailSignature || context.tenant.name,
      },
      context: {
        companyName: context.tenant.name,
        customerName: context.customerMatch?.name ?? extraction.customerName ?? "",
        appointmentText: context.chosenSlot ? describeSlot(context.chosenSlot) : "",
        missingInformation: extraction.missingInformation ?? [],
        signature: context.settings.emailSignature || context.tenant.name,
        subject: email.subject,
      },
    });

    context.demoMode = context.demoMode || outcome.isDemo;
    if (!outcome.data?.body) {
      note(context, "Es konnte kein Antwortentwurf erstellt werden.", "warning");
      return;
    }
    context.reply = {
      subject: outcome.data.subject || `Re: ${email.subject}`,
      body: outcome.data.body,
      confidence: outcome.data.confidence ?? 0.5,
    };

    await stageOrExecute(
      context,
      "draft",
      "draft_email",
      {
        replyToEmailId: email.id,
        to: email.fromEmail,
        subject: context.reply.subject,
        body: context.reply.body,
        customerId: context.customerMatch?.customerId ?? "$ref:customer.id",
        orderId: "$ref:order.id",
      },
      `Antwort an ${email.fromEmail} vorbereiten`,
      { confidence: context.reply.confidence },
    );

    // Der Versand ist immer eine Aktion mit hohem Risiko (§17).
    context.proposed.push({
      id: "send",
      actionKey: "send_email",
      label: `Antwort an ${email.fromEmail} senden`,
      args: { emailId: "$ref:draft.id" },
      riskLevel: "HIGH",
      confidence: context.reply.confidence,
      optional: true,
      enabled: true,
    });
  },

  async create_task(context, step) {
    const config = (step.config as Record<string, any>) ?? {};
    const email = context.email;
    const title = String(config.titleTemplate ?? "Aufgabe von Klarwerk").replace(
      "{{subject}}",
      email?.subject ?? "",
    );

    await stageOrExecute(
      context,
      `task_${step.id}`,
      "create_task",
      {
        title: truncate(title, 120),
        description: email ? `Aus E-Mail von ${email.fromName || email.fromEmail}:\n\n${truncate(email.bodyText, 800)}` : "",
        priority: config.priority ?? "NORMAL",
        customerId: context.customerMatch?.customerId ?? "",
      },
      truncate(title, 80),
    );
  },

  async notify_team(context, step) {
    const config = (step.config as Record<string, any>) ?? {};
    await notify({
      tenantId: context.tenantId,
      type: "workflow_notice",
      title: context.email ? `Neue Nachricht: ${truncate(context.email.subject, 60)}` : "Hinweis von Klarwerk",
      body: context.activity.at(-1)?.message ?? "",
      level: config.level ?? "INFO",
      link: context.email ? `/emails/${context.email.id}` : "/dashboard",
    });
    note(context, "Team benachrichtigt.");
  },

  async request_approval(context) {
    const email = context.email;
    if (!context.proposed.length) {
      note(context, "Es sind keine freigabepflichtigen Aktionen offen.");
      if (email) {
        await tenantDb(context.tenantId).email.update({
          where: { id: email.id },
          data: { status: "PROCESSED" },
        });
      }
      return;
    }

    const extraction = context.extraction ?? {};
    const riskLevel: RiskLevel = context.proposed.some((action) => action.riskLevel === "HIGH")
      ? "HIGH"
      : "MEDIUM";

    const summaryLines = [
      extraction.summary ? `Anliegen: ${extraction.summary}` : null,
      context.customerMatch?.customerId
        ? `Kunde: ${context.customerMatch.name} (Bestandskunde, ${Math.round((context.customerMatch.confidence ?? 0) * 100)} %)`
        : `Kunde: ${extraction.customerName || email?.fromEmail || "unbekannt"} (neu)`,
      `Priorität: ${PRIORITY_LABELS[(context.priorityDecision?.priority as keyof typeof PRIORITY_LABELS) ?? "NORMAL"]}${
        context.priorityDecision?.escalated ? " – durch Betriebsregel angehoben" : ""
      }`,
      context.chosenSlot ? `Terminvorschlag: ${describeSlot(context.chosenSlot)}` : "Kein Terminvorschlag möglich",
      context.lowConfidence.length ? `Bitte prüfen: ${context.lowConfidence.join(", ")}` : null,
      context.demoMode ? "Hinweis: Erstellt im Demo-Modus ohne KI-Modell." : null,
    ].filter(Boolean);

    const approval = await createApproval({
      tenantId: context.tenantId,
      title: email
        ? `Neue Anfrage von ${email.fromName || email.fromEmail}`
        : "Vorschlag von Klarwerk",
      summary: summaryLines.join("\n"),
      riskLevel,
      actions: context.proposed,
      context: {
        emailId: email?.id,
        classification: context.classification,
        extraction: context.extraction,
        customerMatch: context.customerMatch,
        slot: context.chosenSlot
          ? { ...context.chosenSlot, start: context.chosenSlot.start.toISOString(), end: context.chosenSlot.end.toISOString() }
          : null,
        reply: context.reply,
        activity: context.activity,
        lowConfidence: context.lowConfidence,
        demoMode: context.demoMode,
        /* Die Freigabekarte zeigt diese Angaben einzeln an und nicht mehr als
           Fließtext aus `summary`. Deshalb liegt die Priorität hier strukturiert
           daneben statt nur in der zusammengefassten Zeile. */
        priority: context.priorityDecision?.priority ?? "NORMAL",
        priorityEscalated: Boolean(context.priorityDecision?.escalated),
      },
      sourceType: email ? "email" : "workflow",
      sourceId: email?.id,
      workflowRunId: context.runId,
    });

    if (email) {
      await tenantDb(context.tenantId).email.update({
        where: { id: email.id },
        data: { status: "NEEDS_APPROVAL", aiSummary: extraction.summary ?? null, priority: (context.priorityDecision?.priority as any) ?? null },
      });
    }

    note(context, `Freigabe angefordert (${context.proposed.length} Aktionen).`);
    context.results.approval = { data: approval };
  },
};

// ───────────────────────────── Bedingungen ─────────────────────────────

function readPath(context: RunContext, path: string): unknown {
  return path.split(".").reduce<any>((current, segment) => current?.[segment], context as any);
}

export function evaluateCondition(
  context: RunContext,
  condition: { field: string; operator: string; value?: unknown },
): boolean {
  const actual = readPath(context, condition.field);
  switch (condition.operator) {
    case "eq":
      return actual === condition.value;
    case "neq":
      return actual !== condition.value;
    case "in":
      return Array.isArray(condition.value) && condition.value.includes(actual as never);
    case "not_in":
      return Array.isArray(condition.value) && !condition.value.includes(actual as never);
    case "contains":
      return typeof actual === "string" && actual.toLowerCase().includes(String(condition.value).toLowerCase());
    case "gte":
      return Number(actual) >= Number(condition.value);
    case "lte":
      return Number(actual) <= Number(condition.value);
    case "exists":
      return actual !== undefined && actual !== null && actual !== "";
    default:
      return false;
  }
}

// ───────────────────────────── Ausführung ─────────────────────────────

export interface RunWorkflowOptions {
  tenantId: string;
  workflow: Workflow & { steps: WorkflowStep[] };
  email?: Email;
  triggerRef?: string;
  /**
   * Ergebnisse, die sich mehrere Läufe zur selben Nachricht teilen.
   * Ohne Angabe arbeitet der Lauf für sich – dann verhält er sich wie zuvor.
   */
  shared?: SharedEmailResults;
}

export async function runWorkflow(options: RunWorkflowOptions): Promise<RunContext> {
  const db = tenantDb(options.tenantId);
  const [tenant, settings, ownerRole] = await Promise.all([
    db.raw.tenant.findUniqueOrThrow({ where: { id: options.tenantId } }),
    db.raw.tenantSettings.findUnique({ where: { tenantId: options.tenantId } }),
    db.role.findFirst({ where: { key: "owner" } }),
  ]);

  const profile = await getTenantIndustryProfile(options.tenantId, tenant.industryKey);

  const run = await db.workflowRun.create({
    data: {
      tenantId: options.tenantId,
      workflowId: options.workflow.id,
      status: "RUNNING",
      triggerType: options.workflow.trigger,
      triggerRef: options.triggerRef ?? options.email?.id ?? null,
      context: { emailId: options.email?.id ?? null } as object,
    },
  });

  const context: RunContext = {
    tenantId: options.tenantId,
    runId: run.id,
    email: options.email,
    profile: profile as IndustryProfileDefinition,
    tenant: { name: tenant.name, automationLevel: tenant.automationLevel, industryKey: tenant.industryKey },
    settings: {
      emailTone: settings?.emailTone ?? "professional",
      emailSignature: settings?.emailSignature ?? "",
      companyVoice: settings?.companyVoice ?? "",
      minConfidenceCustomerMatch: settings?.minConfidenceCustomerMatch ?? 0.85,
      minConfidenceCategory: settings?.minConfidenceCategory ?? 0.75,
      minConfidencePriority: settings?.minConfidencePriority ?? 0.7,
      minConfidenceExtraction: settings?.minConfidenceExtraction ?? 0.7,
    },
    // Automationen handeln im Namen des Betriebs; die tatsächliche Ausführung
    // riskanter Schritte erfolgt später mit den Rechten der freigebenden Person.
    toolContext: {
      tenantId: options.tenantId,
      actor: { type: "AI", label: "Klarwerk (Automation)" },
      permissions: ownerRole?.permissions ?? ["*"],
      workflowRunId: run.id,
    },
    shared: options.shared ?? {},
    results: {},
    proposed: [],
    activity: [],
    lowConfidence: [],
    demoMode: false,
  };

  const steps = [...options.workflow.steps].sort((a, b) => a.sortOrder - b.sortOrder);

  try {
    for (const step of steps) {
      if (step.type === "condition") {
        const condition = step.condition as { field: string; operator: string; value?: unknown } | null;
        if (condition && !evaluateCondition(context, condition)) {
          context.stopped = step.label || "Bedingung nicht erfüllt";
          note(context, `Abgebrochen: ${step.label || "Bedingung nicht erfüllt"}.`);
          break;
        }
        continue;
      }

      const handler = step.actionKey ? STEP_HANDLERS[step.actionKey] : undefined;
      if (!handler) {
        note(context, `Unbekannter Schritt „${step.actionKey}" wurde übersprungen.`, "warning");
        continue;
      }

      try {
        await handler(context, step);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        note(context, `Schritt „${step.label || step.actionKey}" fehlgeschlagen: ${message}`, "error");
        if (!step.continueOnError) throw error;
      }
    }

    await db.workflowRun.update({
      where: { id: run.id },
      data: {
        status: context.proposed.length ? "WAITING_APPROVAL" : "COMPLETED",
        log: context.activity as object,
        context: {
          emailId: options.email?.id ?? null,
          classification: context.classification ?? null,
          extraction: context.extraction ?? null,
          demoMode: context.demoMode,
        } as object,
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.workflowRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: message.slice(0, 1000), log: context.activity as object, finishedAt: new Date() },
    });
    if (options.email) {
      await db.email.update({
        where: { id: options.email.id },
        data: { status: "FAILED", processingError: message.slice(0, 500) },
      });
    }
    await notify({
      tenantId: options.tenantId,
      type: "workflow_failed",
      title: "Eine Automation konnte nicht abgeschlossen werden.",
      body: message.slice(0, 300),
      level: "URGENT",
      link: options.email ? `/emails/${options.email.id}` : "/automationen",
    });
    await writeAudit({
      tenantId: options.tenantId,
      actorType: "SYSTEM",
      actorLabel: "Klarwerk",
      action: "workflow_failed",
      entityType: "workflow_run",
      entityId: run.id,
      result: "failed",
      details: { workflow: options.workflow.key, error: message },
    });
    log.error("workflow.failed", { tenantId: options.tenantId, workflow: options.workflow.key, error: message });
    throw error;
  }

  await writeAudit({
    tenantId: options.tenantId,
    actorType: "AI",
    actorLabel: "Klarwerk (Automation)",
    action: "workflow_completed",
    entityType: "workflow_run",
    entityId: run.id,
    details: {
      workflow: options.workflow.key,
      steps: context.activity.length,
      proposedActions: context.proposed.length,
      demoMode: context.demoMode,
    },
  });

  return context;
}

/** Startet alle aktiven Automationen für eine eingegangene E-Mail. */
export async function runWorkflowsForEmail(tenantId: string, emailId: string): Promise<RunContext[]> {
  const db = tenantDb(tenantId);
  const email = await db.email.findFirst({ where: { id: emailId } });
  if (!email) throw new AppError("E-Mail nicht gefunden.", 404, "not_found");

  const workflows = await prisma.workflow.findMany({
    where: { tenantId, trigger: "EMAIL_RECEIVED", isActive: true },
    include: { steps: true },
  });

  // Alle Automationen zu dieser Nachricht teilen sich einen Ergebnisspeicher,
  // damit die Einordnung einmal berechnet und danach übernommen wird.
  const shared: SharedEmailResults = {};

  const contexts: RunContext[] = [];
  for (const workflow of workflows) {
    contexts.push(await runWorkflow({ tenantId, workflow, email, shared }));
  }
  return contexts;
}

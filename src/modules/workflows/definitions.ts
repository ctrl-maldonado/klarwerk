import type { WorkflowTriggerType } from "@prisma/client";

export interface WorkflowStepDefinition {
  type: "condition" | "action";
  label: string;
  actionKey?: string;
  condition?: { field: string; operator: "eq" | "neq" | "in" | "not_in" | "contains" | "gte" | "lte" | "exists"; value?: unknown };
  config?: Record<string, unknown>;
}

export interface WorkflowDefinition {
  key: string;
  name: string;
  description: string;
  trigger: WorkflowTriggerType;
  isActive: boolean;
  steps: WorkflowStepDefinition[];
}

/**
 * Mitgelieferte Automationen (§16).
 * Schritte sind Datensätze, keine Programmlogik – Reihenfolge, Bedingungen und
 * Konfiguration lassen sich pro Betrieb ändern und später visuell bearbeiten.
 */
export const DEFAULT_WORKFLOWS: WorkflowDefinition[] = [
  {
    key: "inbound_request_intake",
    name: "Neue Kundenanfrage aufnehmen",
    description:
      "Liest eingehende E-Mails, erkennt das Anliegen, ordnet den Kunden zu, bereitet Auftrag, Termin und Antwort vor und holt die Freigabe ein.",
    trigger: "EMAIL_RECEIVED",
    isActive: true,
    steps: [
      { type: "action", actionKey: "ai_classify_email", label: "E-Mail klassifizieren" },
      {
        type: "condition",
        label: "Nur neue Anfragen und Terminwünsche weiterverarbeiten",
        condition: { field: "classification.categoryKey", operator: "in", value: ["new_request", "appointment", "existing_order", "quote"] },
      },
      { type: "action", actionKey: "ai_extract_request", label: "Angaben aus der Nachricht extrahieren" },
      { type: "action", actionKey: "match_customer", label: "Kunde suchen" },
      { type: "action", actionKey: "create_customer", label: "Neuen Kunden vorschlagen, falls unbekannt" },
      { type: "action", actionKey: "create_order", label: "Auftrag vorbereiten" },
      { type: "action", actionKey: "search_calendar", label: "Kalender nach freien Terminen prüfen" },
      { type: "action", actionKey: "create_appointment", label: "Termin vorschlagen" },
      { type: "action", actionKey: "draft_email", label: "Antwortentwurf erstellen" },
      { type: "action", actionKey: "request_approval", label: "Freigabe einholen" },
    ],
  },
  {
    key: "complaint_escalation",
    name: "Reklamation eskalieren",
    description: "Erkennt Reklamationen, legt eine Aufgabe mit hoher Priorität an und benachrichtigt die Büroleitung.",
    trigger: "EMAIL_RECEIVED",
    isActive: true,
    steps: [
      { type: "action", actionKey: "ai_classify_email", label: "E-Mail klassifizieren" },
      {
        type: "condition",
        label: "Nur Reklamationen",
        condition: { field: "classification.categoryKey", operator: "eq", value: "complaint" },
      },
      {
        type: "action",
        actionKey: "create_task",
        label: "Aufgabe für die Büroleitung anlegen",
        config: { priority: "HIGH", titleTemplate: "Reklamation prüfen: {{subject}}" },
      },
      { type: "action", actionKey: "notify_team", label: "Team benachrichtigen", config: { level: "WARNING" } },
    ],
  },
];

import type { RiskLevel } from "@prisma/client";

/**
 * Katalog der Aktionen, die die AI ausführen darf (§18).
 * Die AI erhält niemals direkten Datenbankzugriff – nur diese Tools.
 * Jede Aktion trägt eine Risikostufe (§17) und eine erforderliche Berechtigung.
 */
export interface AIActionDefinition {
  key: string;
  name: string;
  description: string;
  riskLevel: RiskLevel;
  requiredPermission: string;
  /** JSON-Schema der Argumente – wird auch als Function-Calling-Schema genutzt. */
  parameters: Record<string, unknown>;
  /** Lesende Tools verändern nichts und brauchen nie eine Freigabe. */
  readOnly?: boolean;
}

const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });

export const AI_ACTIONS: AIActionDefinition[] = [
  {
    key: "search_customer",
    name: "Kunde suchen",
    description: "Sucht Kunden anhand von Name, E-Mail, Telefonnummer oder Adresse (unscharfe Suche).",
    riskLevel: "LOW",
    requiredPermission: "customers:read",
    readOnly: true,
    parameters: {
      type: "object",
      properties: {
        query: str("Suchbegriff: Name, E-Mail, Telefon oder Adresse."),
        email: str("Optionale exakte E-Mail-Adresse."),
        phone: str("Optionale Telefonnummer."),
      },
      required: ["query"],
    },
  },
  {
    key: "create_customer",
    name: "Kunde anlegen",
    description: "Legt einen neuen Kunden an.",
    riskLevel: "MEDIUM",
    requiredPermission: "customers:write",
    parameters: {
      type: "object",
      properties: {
        firstName: str("Vorname."),
        lastName: str("Nachname."),
        companyName: str("Firmenname, falls es sich um ein Unternehmen handelt."),
        email: str("E-Mail-Adresse."),
        phone: str("Telefonnummer."),
        street: str("Straße und Hausnummer."),
        zip: str("Postleitzahl."),
        city: str("Ort."),
      },
      required: [],
    },
  },
  {
    key: "update_customer",
    name: "Kunde aktualisieren",
    description: "Ergänzt oder korrigiert Stammdaten eines bestehenden Kunden.",
    riskLevel: "MEDIUM",
    requiredPermission: "customers:write",
    parameters: {
      type: "object",
      properties: {
        customerId: str("ID des Kunden."),
        email: str("Neue E-Mail-Adresse."),
        phone: str("Neue Telefonnummer."),
        street: str("Neue Straße."),
        zip: str("Neue Postleitzahl."),
        city: str("Neuer Ort."),
        notes: str("Notiz, die ergänzt werden soll."),
      },
      required: ["customerId"],
    },
  },
  {
    key: "search_orders",
    name: "Aufträge suchen",
    description: "Sucht Aufträge nach Status, Priorität, Kunde oder Freitext.",
    riskLevel: "LOW",
    requiredPermission: "orders:read",
    readOnly: true,
    parameters: {
      type: "object",
      properties: {
        query: str("Freitext."),
        statusKey: str("Statusschlüssel, z.B. new oder in_progress."),
        priority: str("LOW | NORMAL | HIGH | URGENT."),
        customerId: str("ID des Kunden."),
        onlyOpen: { type: "boolean", description: "Nur nicht abgeschlossene Aufträge." },
      },
      required: [],
    },
  },
  {
    key: "create_order",
    name: "Auftrag erstellen",
    description: "Erstellt einen neuen Auftrag für einen Kunden.",
    riskLevel: "MEDIUM",
    requiredPermission: "orders:write",
    parameters: {
      type: "object",
      properties: {
        customerId: str("ID des Kunden."),
        title: str("Kurzer Titel des Auftrags."),
        description: str("Beschreibung des Problems oder der Leistung."),
        categoryKey: str("Kategorieschlüssel aus dem Branchenprofil."),
        priority: str("LOW | NORMAL | HIGH | URGENT."),
        street: str("Einsatzort – Straße."),
        zip: str("Einsatzort – PLZ."),
        city: str("Einsatzort – Ort."),
        sourceEmailId: str("ID der auslösenden E-Mail."),
      },
      required: ["title"],
    },
  },
  {
    key: "update_order",
    name: "Auftrag aktualisieren",
    description: "Ändert Status, Priorität, Techniker oder Beschreibung eines Auftrags.",
    riskLevel: "MEDIUM",
    requiredPermission: "orders:write",
    parameters: {
      type: "object",
      properties: {
        orderId: str("ID des Auftrags."),
        statusKey: str("Neuer Statusschlüssel."),
        priority: str("Neue Priorität."),
        technicianId: str("ID des zugeordneten Technikers."),
        description: str("Neue Beschreibung."),
        note: str("Notiz, die angehängt wird."),
      },
      required: ["orderId"],
    },
  },
  {
    key: "search_calendar",
    name: "Kalender prüfen",
    description: "Findet freie Termine unter Berücksichtigung von Arbeitszeiten, Urlaub, Auslastung und Qualifikation.",
    riskLevel: "LOW",
    requiredPermission: "calendar:read",
    readOnly: true,
    parameters: {
      type: "object",
      properties: {
        durationMinutes: num("Benötigte Dauer in Minuten."),
        earliest: str("Frühester Zeitpunkt als ISO-Datum."),
        latest: str("Spätester Zeitpunkt als ISO-Datum."),
        preferredDayPart: str("morning | afternoon | any."),
        requiredSkills: { type: "array", items: { type: "string" }, description: "Benötigte Qualifikationen." },
        zip: str("Postleitzahl des Einsatzortes."),
        limit: num("Maximale Anzahl an Vorschlägen."),
      },
      required: ["durationMinutes"],
    },
  },
  {
    key: "create_appointment",
    name: "Termin vorschlagen",
    description: "Legt einen Terminvorschlag an. Der Termin ist erst nach Freigabe verbindlich.",
    riskLevel: "MEDIUM",
    requiredPermission: "calendar:write",
    parameters: {
      type: "object",
      properties: {
        orderId: str("ID des Auftrags."),
        customerId: str("ID des Kunden."),
        employeeId: str("ID des Technikers."),
        title: str("Titel des Termins."),
        start: str("Startzeitpunkt als ISO-Datum."),
        end: str("Endzeitpunkt als ISO-Datum."),
        location: str("Einsatzort."),
      },
      required: ["start", "end"],
    },
  },
  {
    key: "update_appointment",
    name: "Termin ändern",
    description:
      "Verschiebt einen Termin, weist ihn einer anderen Person zu oder ändert seinen Stand. Ohne Endzeitpunkt bleibt die geplante Dauer erhalten.",
    riskLevel: "MEDIUM",
    requiredPermission: "calendar:write",
    parameters: {
      type: "object",
      properties: {
        appointmentId: str("ID des Termins."),
        start: str("Neuer Startzeitpunkt als ISO-Datum."),
        end: str("Neuer Endzeitpunkt als ISO-Datum."),
        employeeId: str("ID der zuständigen Person."),
        status: str("PROPOSED, CONFIRMED oder CANCELLED."),
      },
      required: ["appointmentId"],
    },
  },
  {
    key: "confirm_appointment",
    name: "Termin verbindlich buchen",
    description: "Bestätigt einen Terminvorschlag verbindlich.",
    riskLevel: "HIGH",
    requiredPermission: "calendar:write",
    parameters: {
      type: "object",
      properties: { appointmentId: str("ID des Termins.") },
      required: ["appointmentId"],
    },
  },
  {
    key: "draft_email",
    name: "Antwortentwurf erstellen",
    description: "Erstellt einen Antwortentwurf. Der Entwurf wird nicht versendet.",
    riskLevel: "MEDIUM",
    requiredPermission: "emails:write",
    parameters: {
      type: "object",
      properties: {
        replyToEmailId: str("ID der zu beantwortenden E-Mail."),
        to: str("Empfängeradresse."),
        subject: str("Betreff."),
        body: str("Nachrichtentext."),
        customerId: str("ID des Kunden."),
        orderId: str("ID des Auftrags."),
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    key: "send_email",
    name: "E-Mail senden",
    description: "Versendet eine E-Mail an den Kunden. Immer freigabepflichtig.",
    riskLevel: "HIGH",
    requiredPermission: "emails:send",
    parameters: {
      type: "object",
      properties: { emailId: str("ID des zu versendenden Entwurfs.") },
      required: ["emailId"],
    },
  },
  {
    key: "search_documents",
    name: "Dokumente durchsuchen",
    description: "Durchsucht Dokumente und Anhänge des Mandanten.",
    riskLevel: "LOW",
    requiredPermission: "documents:read",
    readOnly: true,
    parameters: {
      type: "object",
      properties: {
        query: str("Suchbegriff."),
        customerId: str("Auf einen Kunden einschränken."),
        orderId: str("Auf einen Auftrag einschränken."),
      },
      required: [],
    },
  },
  {
    key: "create_task",
    name: "Aufgabe erstellen",
    description: "Legt eine interne Aufgabe an, z.B. für eine Rückfrage.",
    riskLevel: "MEDIUM",
    requiredPermission: "tasks:write",
    parameters: {
      type: "object",
      properties: {
        title: str("Titel der Aufgabe."),
        description: str("Beschreibung."),
        dueAt: str("Fälligkeit als ISO-Datum."),
        customerId: str("Bezug zum Kunden."),
        orderId: str("Bezug zum Auftrag."),
        priority: str("LOW | NORMAL | HIGH | URGENT."),
      },
      required: ["title"],
    },
  },
  {
    key: "search_emails",
    name: "E-Mails durchsuchen",
    description: "Durchsucht den Posteingang des Mandanten.",
    riskLevel: "LOW",
    requiredPermission: "emails:read",
    readOnly: true,
    parameters: {
      type: "object",
      properties: {
        query: str("Suchbegriff."),
        status: str("Statusfilter."),
        customerId: str("Auf einen Kunden einschränken."),
        unansweredSinceDays: num("Nur E-Mails, die seit N Tagen unbeantwortet sind."),
      },
      required: [],
    },
  },
  {
    key: "get_analytics",
    name: "Kennzahlen abrufen",
    description: "Liefert aggregierte Kennzahlen des Mandanten (Anfragen, Aufträge, Automatisierungsgrad).",
    riskLevel: "LOW",
    requiredPermission: "analytics:read",
    readOnly: true,
    parameters: {
      type: "object",
      properties: { days: num("Zeitraum in Tagen, Standard 30.") },
      required: [],
    },
  },
];

export function getActionDefinition(key: string): AIActionDefinition | undefined {
  return AI_ACTIONS.find((action) => action.key === key);
}

/** Standard-Freigabepflicht je Risikostufe – pro Tenant überschreibbar (§17). */
export const DEFAULT_APPROVAL_POLICY: Record<RiskLevel, "auto" | "approve"> = {
  LOW: "auto",
  MEDIUM: "approve",
  HIGH: "approve",
};

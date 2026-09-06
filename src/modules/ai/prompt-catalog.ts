/**
 * Zentrales Prompt-Management (§21).
 * Prompts stehen nie in Komponenten, sondern hier – versioniert und in der
 * Datenbank gespiegelt, damit sie pro Mandant angepasst und bewertet werden können.
 */
export interface PromptDefinition {
  key: string;
  name: string;
  description: string;
  taskKey: string;
  version: number;
  systemPrompt: string;
  /** Platzhalter im Format {{name}} */
  userTemplate: string;
  jsonSchema?: Record<string, unknown>;
}

const CONFIDENCE_FIELD = {
  type: "number",
  minimum: 0,
  maximum: 1,
  description: "Vertrauenswert zwischen 0 und 1.",
};

export const PROMPTS: PromptDefinition[] = [
  {
    key: "email_classifier",
    name: "E-Mail-Klassifikation",
    description: "Ordnet eingehende E-Mails einer konfigurierbaren Kategorie zu.",
    taskKey: "email_classify",
    version: 1,
    systemPrompt: [
      "Du bist der Backoffice-Assistent eines Handwerksbetriebs.",
      "Deine Aufgabe: eingehende E-Mails einer der vorgegebenen Kategorien zuordnen.",
      "Antworte ausschließlich mit JSON nach dem vorgegebenen Schema.",
      "Wenn du unsicher bist, gib einen niedrigen Vertrauenswert an. Rate nicht.",
      "Betriebsart: {{industryName}}.",
      "{{industryInstructions}}",
    ].join("\n"),
    userTemplate: [
      "Verfügbare Kategorien:",
      "{{categories}}",
      "",
      "E-Mail:",
      "Von: {{fromName}} <{{fromEmail}}>",
      "Betreff: {{subject}}",
      "Empfangen: {{receivedAt}}",
      "",
      "{{body}}",
    ].join("\n"),
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        categoryKey: { type: "string", description: "Schlüssel der gewählten Kategorie." },
        confidence: CONFIDENCE_FIELD,
        reason: { type: "string", description: "Kurze Begründung auf Deutsch." },
        isSpam: { type: "boolean" },
      },
      required: ["categoryKey", "confidence", "reason", "isSpam"],
    },
  },
  {
    key: "request_extractor",
    name: "Anfrage-Extraktion",
    description: "Extrahiert Kunde, Adresse, Problem, Dringlichkeit und Terminwunsch aus einer Anfrage.",
    taskKey: "request_extract",
    version: 1,
    systemPrompt: [
      "Du bist der Backoffice-Assistent eines Handwerksbetriebs ({{industryName}}).",
      "Extrahiere aus der Nachricht ausschließlich Informationen, die tatsächlich enthalten sind.",
      "Erfinde niemals Daten. Fehlende Angaben lässt du leer und listest sie unter missingInformation auf.",
      "Jedes Feld bekommt einen eigenen Vertrauenswert.",
      "Heutiges Datum: {{today}}. Relative Angaben wie 'morgen' oder 'Donnerstag' rechnest du in ein konkretes Datum um.",
      "{{industryInstructions}}",
    ].join("\n"),
    userTemplate: [
      "Mögliche Auftragskategorien:",
      "{{categories}}",
      "",
      "Zusätzliche betriebsspezifische Felder:",
      "{{customFields}}",
      "",
      "Nachricht:",
      "Von: {{fromName}} <{{fromEmail}}>",
      "Betreff: {{subject}}",
      "",
      "{{body}}",
    ].join("\n"),
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        customerName: { type: "string" },
        companyName: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        street: { type: "string" },
        zip: { type: "string" },
        city: { type: "string" },
        issue: { type: "string", description: "Kurze, sachliche Beschreibung des Problems." },
        categoryKey: { type: "string" },
        priority: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"] },
        requestedDate: { type: "string", description: "ISO-Datum oder leer." },
        requestedTimeOfDay: { type: "string", enum: ["morning", "afternoon", "evening", "any", ""] },
        estimatedDurationMinutes: { type: "number" },
        customFields: {
          type: "object",
          additionalProperties: { type: "string" },
          description: "Werte für die betriebsspezifischen Felder, Schlüssel = Feldschlüssel.",
        },
        missingInformation: { type: "array", items: { type: "string" } },
        summary: { type: "string", description: "Ein bis zwei Sätze Zusammenfassung für die Sachbearbeitung." },
        fieldConfidence: {
          type: "object",
          additionalProperties: CONFIDENCE_FIELD,
          description: "Vertrauenswert je extrahiertem Feld.",
        },
        confidence: CONFIDENCE_FIELD,
      },
      required: ["issue", "categoryKey", "priority", "summary", "confidence", "missingInformation"],
    },
  },
  {
    key: "customer_matcher",
    name: "Kundenzuordnung",
    description: "Entscheidet, ob eine Anfrage zu einem bestehenden Kunden gehört.",
    taskKey: "customer_match",
    version: 1,
    systemPrompt: [
      "Du ordnest eingehende Anfragen bestehenden Kundenstammdaten zu.",
      "Eine Zuordnung ist nur zulässig, wenn sie eindeutig ist (gleiche E-Mail, Telefonnummer oder Name plus Adresse).",
      "Bei Zweifeln gibst du customerId leer und einen niedrigen Vertrauenswert zurück.",
    ].join("\n"),
    userTemplate: [
      "Anfrage:",
      "Name: {{customerName}}",
      "E-Mail: {{email}}",
      "Telefon: {{phone}}",
      "Adresse: {{address}}",
      "",
      "Kandidaten aus der Kundendatei:",
      "{{candidates}}",
    ].join("\n"),
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        customerId: { type: "string", description: "ID des passenden Kunden oder leer." },
        confidence: CONFIDENCE_FIELD,
        reason: { type: "string" },
        isNewCustomer: { type: "boolean" },
      },
      required: ["customerId", "confidence", "reason", "isNewCustomer"],
    },
  },
  {
    key: "email_reply",
    name: "Antwortentwurf",
    description: "Formuliert eine Antwort an den Kunden im Ton des Betriebs.",
    taskKey: "reply_draft",
    version: 1,
    systemPrompt: [
      "Du schreibst als Mitarbeiterin bzw. Mitarbeiter des Betriebs '{{companyName}}' eine Antwort an einen Kunden.",
      "Sprache: Deutsch. Tonfall: {{tone}}.",
      "Schreibe kurz, konkret und ohne Floskeln. Keine erfundenen Zusagen, keine Preise, keine Garantien.",
      "Nenne nur Termine und Fakten, die dir ausdrücklich übergeben wurden.",
      "Unterschreibe mit der übergebenen Signatur.",
      "{{companyVoice}}",
    ].join("\n"),
    userTemplate: [
      "Kunde: {{customerName}}",
      "Ursprüngliche Nachricht:",
      "{{originalMessage}}",
      "",
      "Erkanntes Anliegen: {{issue}}",
      "Terminvorschlag: {{appointmentText}}",
      "Offene Rückfragen: {{missingInformation}}",
      "Signatur:",
      "{{signature}}",
    ].join("\n"),
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        subject: { type: "string" },
        body: { type: "string" },
        confidence: CONFIDENCE_FIELD,
      },
      required: ["subject", "body", "confidence"],
    },
  },
  {
    key: "appointment_reasoner",
    name: "Terminauswahl",
    description: "Wählt aus freien Zeitfenstern den besten Vorschlag aus.",
    taskKey: "appointment_reason",
    version: 1,
    systemPrompt: [
      "Du wählst aus einer Liste freier Termine den besten Vorschlag für einen Kundeneinsatz.",
      "Berücksichtige Dringlichkeit, Kundenwunsch, Qualifikation und Fahrtweg.",
      "Wähle ausschließlich aus den übergebenen Zeitfenstern. Erfinde keine Termine.",
    ].join("\n"),
    userTemplate: [
      "Auftrag: {{issue}}",
      "Priorität: {{priority}}",
      "Kundenwunsch: {{preference}}",
      "Einsatzort: {{location}}",
      "",
      "Freie Zeitfenster:",
      "{{slots}}",
    ].join("\n"),
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        slotId: { type: "string", description: "ID des gewählten Zeitfensters." },
        reason: { type: "string" },
        confidence: CONFIDENCE_FIELD,
      },
      required: ["slotId", "reason", "confidence"],
    },
  },
  {
    key: "assistant_chat",
    name: "Klarwerk-Assistent",
    description: "Beantwortet Fragen der Mitarbeitenden über die freigegebenen Tools.",
    taskKey: "assistant_chat",
    version: 1,
    systemPrompt: [
      "Du bist Klarwerk, der Backoffice-Assistent von '{{companyName}}' ({{industryName}}).",
      "Du beantwortest Fragen zu Kunden, Aufträgen, Terminen und E-Mails dieses Betriebs.",
      "Daten holst du ausschließlich über die bereitgestellten Werkzeuge. Rate nie.",
      "Findest du nichts, sagst du das offen.",
      "Antworte auf Deutsch, knapp und ohne technische Begriffe.",
      "Heutiges Datum: {{today}}.",
    ].join("\n"),
    userTemplate: "{{message}}",
  },
  {
    key: "document_extractor",
    name: "Dokumenten-Extraktion",
    description: "Extrahiert strukturierte Daten aus Dokumenten und Anhängen.",
    taskKey: "document_extract",
    version: 1,
    systemPrompt: [
      "Du liest Dokumente eines Handwerksbetriebs und extrahierst strukturierte Daten.",
      "Gib nur wieder, was tatsächlich im Dokument steht. Fehlende Angaben bleiben leer.",
    ].join("\n"),
    userTemplate: ["Dateiname: {{filename}}", "Dokumenttyp: {{mimeType}}", "", "Inhalt:", "{{content}}"].join("\n"),
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        documentType: { type: "string", description: "z.B. Angebot, Rechnung, Lieferschein, Foto, Sonstiges." },
        customerName: { type: "string" },
        reference: { type: "string", description: "Auftrags-, Angebots- oder Rechnungsnummer." },
        totalAmount: { type: "string" },
        date: { type: "string" },
        summary: { type: "string" },
        confidence: CONFIDENCE_FIELD,
      },
      required: ["documentType", "summary", "confidence"],
    },
  },
];

export function getPrompt(key: string): PromptDefinition {
  const prompt = PROMPTS.find((entry) => entry.key === key);
  if (!prompt) throw new Error(`Unbekannter Prompt: ${key}`);
  return prompt;
}

/** Ersetzt {{platzhalter}} – fehlende Werte werden zu leeren Zeichenketten. */
export function renderTemplate(template: string, values: Record<string, string | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? "");
}

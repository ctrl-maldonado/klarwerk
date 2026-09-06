import type {
  EmailCategoryDefinition,
  IndustryProfileDefinition,
  OrderStatusDefinition,
} from "./types";

/**
 * Branchenprofile (§22). Kein Branchenwissen im Code – alles hier als Daten,
 * beim Anlegen eines Tenants in die Datenbank kopiert und dort editierbar.
 */

const BASE_EMAIL_CATEGORIES: EmailCategoryDefinition[] = [
  { key: "new_request", label: "Neue Anfrage", color: "#2563eb", aiHint: "Kunde bittet erstmalig um Hilfe, Angebot oder Termin." },
  { key: "existing_order", label: "Bestehender Auftrag", color: "#7c3aed", aiHint: "Bezieht sich auf einen bereits laufenden Auftrag." },
  { key: "appointment", label: "Termin", color: "#0891b2", aiHint: "Terminwunsch, Verschiebung oder Absage." },
  { key: "quote", label: "Angebot", color: "#059669", aiHint: "Angebotsanfrage, Rückfrage oder Zusage zu einem Angebot." },
  { key: "invoice", label: "Rechnung", color: "#d97706", aiHint: "Rechnung, Mahnung, Zahlung." },
  { key: "complaint", label: "Reklamation", color: "#dc2626", aiHint: "Beschwerde oder Mangel nach erbrachter Leistung." },
  { key: "general_question", label: "Allgemeine Frage", color: "#64748b", aiHint: "Frage ohne konkreten Auftragsbezug." },
  { key: "spam", label: "Spam", color: "#94a3b8", aiHint: "Werbung, Newsletter, unaufgeforderte Massenmail." },
  { key: "other", label: "Sonstiges", color: "#475569", aiHint: "Passt in keine andere Kategorie." },
];

const BASE_ORDER_STATUSES: OrderStatusDefinition[] = [
  { key: "new", label: "Neu", color: "#2563eb", isDefault: true },
  { key: "review", label: "Prüfung", color: "#7c3aed" },
  { key: "quote_required", label: "Angebot erforderlich", color: "#d97706" },
  { key: "scheduled", label: "Geplant", color: "#0891b2" },
  { key: "in_progress", label: "In Bearbeitung", color: "#0d9488" },
  { key: "done", label: "Erledigt", color: "#16a34a", isTerminal: true },
  { key: "cancelled", label: "Storniert", color: "#64748b", isTerminal: true },
];

const BASE_EMAIL_TEMPLATES = [
  {
    key: "appointment_offer",
    label: "Terminvorschlag",
    subject: "Ihre Anfrage – Terminvorschlag",
    body: "Hallo {{anrede}},\n\nvielen Dank für Ihre Anfrage.\n\nWir können Ihnen {{termin}} anbieten.\n\nViele Grüße\n{{firma}}",
  },
  {
    key: "acknowledge",
    label: "Eingangsbestätigung",
    subject: "Wir haben Ihre Anfrage erhalten",
    body: "Hallo {{anrede}},\n\nvielen Dank für Ihre Nachricht. Wir melden uns kurzfristig mit einem Terminvorschlag.\n\nViele Grüße\n{{firma}}",
  },
  {
    key: "missing_info",
    label: "Rückfrage fehlende Angaben",
    subject: "Kurze Rückfrage zu Ihrer Anfrage",
    body: "Hallo {{anrede}},\n\nvielen Dank für Ihre Anfrage. Damit wir den Einsatz vorbereiten können, benötigen wir noch: {{fehlende_angaben}}.\n\nViele Grüße\n{{firma}}",
  },
];

function base(
  key: string,
  name: string,
  overrides: Partial<IndustryProfileDefinition>,
): IndustryProfileDefinition {
  return {
    key,
    name,
    terminology: { order: "Auftrag", customer: "Kunde", technician: "Techniker", appointment: "Termin" },
    orderCategories: [],
    priorityRules: [
      {
        key: "emergency_wording",
        description: "Notfall-Formulierungen führen sofort zu höchster Priorität.",
        keywords: ["notfall", "notdienst", "dringend", "sofort", "wasserschaden", "gasgeruch", "überschwemmt", "läuft aus"],
        priority: "URGENT",
      },
      {
        key: "total_outage",
        description: "Kompletter Ausfall einer Anlage ist hoch priorisiert.",
        keywords: ["ausgefallen", "funktioniert nicht", "kein warmwasser", "keine heizung", "kein strom", "defekt"],
        priority: "HIGH",
      },
      {
        key: "quote_or_planning",
        description: "Angebots- und Planungsanfragen sind normal priorisiert.",
        categories: ["quote", "general_question"],
        priority: "NORMAL",
      },
    ],
    fields: [],
    emailCategories: BASE_EMAIL_CATEGORIES,
    orderStatuses: BASE_ORDER_STATUSES,
    emailTemplates: BASE_EMAIL_TEMPLATES,
    aiInstructions: [],
    ...overrides,
  };
}

export const INDUSTRY_PROFILES: IndustryProfileDefinition[] = [
  base("plumbing_heating", "SHK / Sanitär, Heizung, Klima", {
    terminology: { order: "Auftrag", customer: "Kunde", technician: "Monteur", appointment: "Termin" },
    orderCategories: [
      { key: "heating_failure", label: "Heizungsausfall", keywords: ["heizung", "heizt nicht", "kalt", "therme", "brenner", "kein warmwasser"], defaultPriority: "HIGH", estimatedMinutes: 120, requiredSkills: ["heizung"] },
      { key: "heating_maintenance", label: "Heizungswartung", keywords: ["wartung", "jahreswartung", "inspektion"], defaultPriority: "NORMAL", estimatedMinutes: 90, requiredSkills: ["heizung"] },
      { key: "water_damage", label: "Wasserschaden / Rohrbruch", keywords: ["wasserschaden", "rohrbruch", "läuft aus", "undicht", "überschwemmt"], defaultPriority: "URGENT", estimatedMinutes: 180, requiredSkills: ["sanitaer"] },
      { key: "sanitary_installation", label: "Sanitärinstallation", keywords: ["bad", "waschbecken", "dusche", "wc", "armatur", "toilette"], defaultPriority: "NORMAL", estimatedMinutes: 240, requiredSkills: ["sanitaer"] },
      { key: "drain_blockage", label: "Verstopfung", keywords: ["verstopft", "abfluss", "kanal", "läuft nicht ab"], defaultPriority: "HIGH", estimatedMinutes: 90, requiredSkills: ["sanitaer"] },
      { key: "air_conditioning", label: "Klima / Lüftung", keywords: ["klima", "lüftung", "klimaanlage", "split"], defaultPriority: "NORMAL", estimatedMinutes: 150, requiredSkills: ["klima"] },
      { key: "quote_request", label: "Angebotsanfrage", keywords: ["angebot", "kostenvoranschlag", "was kostet", "preis"], defaultPriority: "NORMAL", estimatedMinutes: 60, requiredSkills: [] },
      { key: "other", label: "Sonstiges", keywords: [], defaultPriority: "NORMAL", estimatedMinutes: 60, requiredSkills: [] },
    ],
    fields: [
      { entityType: "order", key: "heating_type", label: "Heizungsart", type: "SELECT", options: ["Gastherme", "Ölheizung", "Wärmepumpe", "Fernwärme", "Pelletheizung", "Sonstige"], aiHint: "Art der Heizungsanlage, falls im Text genannt." },
      { entityType: "order", key: "manufacturer", label: "Hersteller", type: "TEXT", aiHint: "Hersteller der Anlage, z.B. Vaillant, Viessmann, Buderus." },
      { entityType: "order", key: "build_year", label: "Baujahr", type: "NUMBER", aiHint: "Baujahr der Anlage als vierstellige Zahl." },
      { entityType: "order", key: "error_code", label: "Fehlercode", type: "TEXT", aiHint: "Fehlercode im Display, z.B. F28." },
    ],
    aiInstructions: [
      "Bei Gasgeruch, Wasseraustritt oder komplettem Heizungsausfall im Winter ist die Priorität immer URGENT.",
      "Erfrage fehlende Angaben zu Anlagentyp, Hersteller und Fehlercode, wenn sie für die Einsatzplanung nötig sind.",
    ],
  }),

  base("electrical", "Elektro", {
    terminology: { order: "Auftrag", customer: "Kunde", technician: "Elektriker", appointment: "Termin" },
    orderCategories: [
      { key: "power_failure", label: "Stromausfall / Störung", keywords: ["kein strom", "stromausfall", "sicherung", "fi", "fliegt raus", "kurzschluss"], defaultPriority: "URGENT", estimatedMinutes: 120, requiredSkills: ["elektro"] },
      { key: "installation", label: "Neuinstallation", keywords: ["steckdose", "leitung", "verkabelung", "neubau", "installation"], defaultPriority: "NORMAL", estimatedMinutes: 240, requiredSkills: ["elektro"] },
      { key: "lighting", label: "Beleuchtung", keywords: ["licht", "lampe", "beleuchtung", "leuchte"], defaultPriority: "LOW", estimatedMinutes: 90, requiredSkills: ["elektro"] },
      { key: "e_mobility", label: "E-Mobilität / Wallbox", keywords: ["wallbox", "ladestation", "e-auto"], defaultPriority: "NORMAL", estimatedMinutes: 300, requiredSkills: ["elektro", "emobility"] },
      { key: "pv_system", label: "Photovoltaik", keywords: ["photovoltaik", "pv", "solar", "speicher"], defaultPriority: "NORMAL", estimatedMinutes: 480, requiredSkills: ["pv"] },
      { key: "inspection", label: "Prüfung / E-Check", keywords: ["e-check", "prüfung", "dguv", "messung"], defaultPriority: "NORMAL", estimatedMinutes: 120, requiredSkills: ["elektro"] },
      { key: "other", label: "Sonstiges", keywords: [], defaultPriority: "NORMAL", estimatedMinutes: 60, requiredSkills: [] },
    ],
    fields: [
      { entityType: "order", key: "distribution_board", label: "Sicherungskasten", type: "TEXT", aiHint: "Ort oder Typ der Unterverteilung." },
      { entityType: "order", key: "system", label: "Anlage", type: "TEXT", aiHint: "Betroffene Anlage oder Gerät." },
      { entityType: "order", key: "voltage", label: "Spannung", type: "SELECT", options: ["230 V", "400 V", "Sonstige"], aiHint: "Spannungsebene der betroffenen Anlage." },
      { entityType: "order", key: "error_code", label: "Fehlercode", type: "TEXT", aiHint: "Angezeigter Fehlercode." },
    ],
    aiInstructions: [
      "Bei Rauchentwicklung, Brandgeruch oder ausgefallener Hauptsicherung ist die Priorität URGENT.",
    ],
  }),

  base("roofing", "Dachdecker", {
    terminology: { order: "Auftrag", customer: "Kunde", technician: "Dachdecker", appointment: "Termin" },
    orderCategories: [
      { key: "leak", label: "Undichtigkeit / Sturmschaden", keywords: ["undicht", "es regnet rein", "sturm", "ziegel", "sturmschaden", "leck"], defaultPriority: "URGENT", estimatedMinutes: 180, requiredSkills: ["dach"] },
      { key: "new_roof", label: "Neueindeckung", keywords: ["neueindeckung", "neues dach", "sanierung"], defaultPriority: "NORMAL", estimatedMinutes: 960, requiredSkills: ["dach"] },
      { key: "gutter", label: "Dachrinne", keywords: ["dachrinne", "rinne", "fallrohr"], defaultPriority: "NORMAL", estimatedMinutes: 120, requiredSkills: ["dach"] },
      { key: "insulation", label: "Dämmung", keywords: ["dämmung", "isolierung"], defaultPriority: "NORMAL", estimatedMinutes: 480, requiredSkills: ["dach"] },
      { key: "inspection", label: "Dachinspektion", keywords: ["inspektion", "check", "begutachtung"], defaultPriority: "LOW", estimatedMinutes: 90, requiredSkills: ["dach"] },
      { key: "other", label: "Sonstiges", keywords: [], defaultPriority: "NORMAL", estimatedMinutes: 60, requiredSkills: [] },
    ],
    fields: [
      { entityType: "order", key: "roof_type", label: "Dachart", type: "SELECT", options: ["Satteldach", "Flachdach", "Walmdach", "Pultdach", "Sonstige"], aiHint: "Art des Daches." },
      { entityType: "order", key: "roof_area", label: "Dachfläche (m²)", type: "NUMBER", aiHint: "Fläche in Quadratmetern." },
      { entityType: "order", key: "scaffolding", label: "Gerüst vorhanden", type: "BOOLEAN", aiHint: "Ist bereits ein Gerüst gestellt?" },
    ],
    aiInstructions: ["Bei eindringendem Wasser oder Sturmschaden ist die Priorität URGENT."],
  }),

  base("painting", "Maler & Lackierer", {
    terminology: { order: "Auftrag", customer: "Kunde", technician: "Maler", appointment: "Termin" },
    orderCategories: [
      { key: "interior", label: "Innenanstrich", keywords: ["streichen", "wand", "innen", "tapete", "decke"], defaultPriority: "NORMAL", estimatedMinutes: 480, requiredSkills: ["maler"] },
      { key: "facade", label: "Fassade", keywords: ["fassade", "außen", "wdvs"], defaultPriority: "NORMAL", estimatedMinutes: 960, requiredSkills: ["maler"] },
      { key: "mould", label: "Schimmelsanierung", keywords: ["schimmel", "feuchtigkeit", "stockflecken"], defaultPriority: "HIGH", estimatedMinutes: 300, requiredSkills: ["maler", "sanierung"] },
      { key: "floor", label: "Bodenbelag", keywords: ["boden", "laminat", "teppich", "vinyl"], defaultPriority: "NORMAL", estimatedMinutes: 480, requiredSkills: ["boden"] },
      { key: "other", label: "Sonstiges", keywords: [], defaultPriority: "NORMAL", estimatedMinutes: 60, requiredSkills: [] },
    ],
    fields: [
      { entityType: "order", key: "area_sqm", label: "Fläche (m²)", type: "NUMBER", aiHint: "Zu bearbeitende Fläche." },
      { entityType: "order", key: "rooms", label: "Räume", type: "NUMBER", aiHint: "Anzahl der Räume." },
      { entityType: "order", key: "color", label: "Farbton", type: "TEXT", aiHint: "Gewünschter Farbton, z.B. RAL 9010." },
    ],
    aiInstructions: ["Bei Schimmelbefall auf Gesundheitsrelevanz hinweisen und mindestens HIGH priorisieren."],
  }),

  base("carpentry", "Schreiner / Tischler / Fensterbau", {
    terminology: { order: "Auftrag", customer: "Kunde", technician: "Schreiner", appointment: "Termin" },
    orderCategories: [
      { key: "window_door", label: "Fenster & Türen", keywords: ["fenster", "tür", "rollladen", "beschlag"], defaultPriority: "NORMAL", estimatedMinutes: 300, requiredSkills: ["fensterbau"] },
      { key: "broken_glass", label: "Glasbruch / Einbruchschaden", keywords: ["glasbruch", "scheibe kaputt", "einbruch", "zerbrochen"], defaultPriority: "URGENT", estimatedMinutes: 120, requiredSkills: ["fensterbau"] },
      { key: "furniture", label: "Möbelbau", keywords: ["möbel", "schrank", "küche", "einbau"], defaultPriority: "NORMAL", estimatedMinutes: 600, requiredSkills: ["moebel"] },
      { key: "repair", label: "Reparatur", keywords: ["reparatur", "klemmt", "schließt nicht"], defaultPriority: "NORMAL", estimatedMinutes: 120, requiredSkills: [] },
      { key: "other", label: "Sonstiges", keywords: [], defaultPriority: "NORMAL", estimatedMinutes: 60, requiredSkills: [] },
    ],
    fields: [
      { entityType: "order", key: "material", label: "Material", type: "SELECT", options: ["Holz", "Kunststoff", "Aluminium", "Holz-Alu"], aiHint: "Werkstoff." },
      { entityType: "order", key: "dimensions", label: "Maße", type: "TEXT", aiHint: "Breite x Höhe in cm." },
    ],
    aiInstructions: ["Bei Einbruch- oder Glasschaden ist Notverschluss nötig – Priorität URGENT."],
  }),

  base("cleaning", "Gebäudereinigung", {
    terminology: { order: "Auftrag", customer: "Auftraggeber", technician: "Reinigungskraft", appointment: "Einsatz" },
    orderCategories: [
      { key: "maintenance_cleaning", label: "Unterhaltsreinigung", keywords: ["unterhaltsreinigung", "regelmäßig", "büroreinigung", "treppenhaus"], defaultPriority: "NORMAL", estimatedMinutes: 180, requiredSkills: ["reinigung"] },
      { key: "basic_cleaning", label: "Grundreinigung", keywords: ["grundreinigung", "einmalig", "endreinigung"], defaultPriority: "NORMAL", estimatedMinutes: 480, requiredSkills: ["reinigung"] },
      { key: "glass_cleaning", label: "Glasreinigung", keywords: ["fensterreinigung", "glasreinigung", "scheiben"], defaultPriority: "LOW", estimatedMinutes: 240, requiredSkills: ["glas"] },
      { key: "special_cleaning", label: "Sonderreinigung", keywords: ["wasserschaden", "brand", "baustelle", "sonderreinigung"], defaultPriority: "HIGH", estimatedMinutes: 360, requiredSkills: ["sonder"] },
      { key: "winter_service", label: "Winterdienst", keywords: ["winterdienst", "schnee", "streuen", "glätte"], defaultPriority: "HIGH", estimatedMinutes: 120, requiredSkills: ["winterdienst"] },
      { key: "other", label: "Sonstiges", keywords: [], defaultPriority: "NORMAL", estimatedMinutes: 60, requiredSkills: [] },
    ],
    fields: [
      { entityType: "order", key: "object_size", label: "Objektgröße (m²)", type: "NUMBER", aiHint: "Zu reinigende Fläche." },
      { entityType: "order", key: "interval", label: "Intervall", type: "SELECT", options: ["einmalig", "wöchentlich", "2x wöchentlich", "monatlich"], aiHint: "Reinigungsintervall." },
      { entityType: "order", key: "access", label: "Zugang / Schlüssel", type: "TEXT", aiHint: "Wie kommt das Team ins Objekt?" },
    ],
    aiInstructions: ["Bei Wasserschaden oder Glätte ist die Priorität mindestens HIGH."],
  }),

  base("facility", "Hausmeisterdienst", {
    terminology: { order: "Auftrag", customer: "Auftraggeber", technician: "Hausmeister", appointment: "Einsatz" },
    orderCategories: [
      { key: "repair", label: "Kleinreparatur", keywords: ["reparatur", "defekt", "kaputt", "klemmt"], defaultPriority: "NORMAL", estimatedMinutes: 90, requiredSkills: [] },
      { key: "green_area", label: "Grünpflege", keywords: ["rasen", "hecke", "garten", "grünpflege"], defaultPriority: "LOW", estimatedMinutes: 180, requiredSkills: ["gruen"] },
      { key: "winter_service", label: "Winterdienst", keywords: ["schnee", "streuen", "glätte", "winterdienst"], defaultPriority: "HIGH", estimatedMinutes: 90, requiredSkills: ["winterdienst"] },
      { key: "inspection", label: "Objektkontrolle", keywords: ["begehung", "kontrolle", "prüfung"], defaultPriority: "LOW", estimatedMinutes: 60, requiredSkills: [] },
      { key: "other", label: "Sonstiges", keywords: [], defaultPriority: "NORMAL", estimatedMinutes: 60, requiredSkills: [] },
    ],
    fields: [
      { entityType: "order", key: "object", label: "Objekt", type: "TEXT", aiHint: "Bezeichnung der Liegenschaft." },
      { entityType: "order", key: "unit", label: "Einheit / Wohnung", type: "TEXT", aiHint: "Betroffene Einheit." },
    ],
    aiInstructions: [],
  }),

  base("other", "Sonstiges Dienstleistungsgewerbe", {
    orderCategories: [
      { key: "service_request", label: "Serviceanfrage", keywords: ["hilfe", "problem", "defekt", "störung"], defaultPriority: "NORMAL", estimatedMinutes: 120, requiredSkills: [] },
      { key: "maintenance", label: "Wartung", keywords: ["wartung", "inspektion", "service"], defaultPriority: "NORMAL", estimatedMinutes: 120, requiredSkills: [] },
      { key: "quote_request", label: "Angebotsanfrage", keywords: ["angebot", "kostenvoranschlag", "preis"], defaultPriority: "NORMAL", estimatedMinutes: 60, requiredSkills: [] },
      { key: "other", label: "Sonstiges", keywords: [], defaultPriority: "NORMAL", estimatedMinutes: 60, requiredSkills: [] },
    ],
    fields: [],
    aiInstructions: [],
  }),
];

export function getIndustryProfile(key: string): IndustryProfileDefinition {
  return INDUSTRY_PROFILES.find((profile) => profile.key === key) ?? INDUSTRY_PROFILES[INDUSTRY_PROFILES.length - 1];
}

export const INDUSTRY_OPTIONS = INDUSTRY_PROFILES.map((profile) => ({
  key: profile.key,
  name: profile.name,
}));

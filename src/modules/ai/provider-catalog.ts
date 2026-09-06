/**
 * Welche AI-Anbieter kennt Klarwerk? Eine Liste, kein `if` im Code (§26).
 * Ein neuer Anbieter braucht einen Eintrag hier und eine Umsetzung
 * von `AIProvider` unter `providers/`.
 */

export interface AIProviderCatalogEntry {
  key: string;
  label: string;
  /** Kurzhinweis in der Oberfläche. */
  hint: string;
  defaultModel: string;
  /** Modelle zur Auswahl. Freitext bleibt möglich. */
  models: string[];
  /** false = regelbasierter Demo-Modus, kein Zugang nötig. */
  requiresKey: boolean;
  keyPlaceholder: string;
  baseUrlPlaceholder: string;
}

export const AI_PROVIDER_LIST: AIProviderCatalogEntry[] = [
  {
    key: "anthropic",
    label: "Anthropic (Claude)",
    hint: "Schlüssel aus der Anthropic Console (console.anthropic.com).",
    defaultModel: "claude-opus-5",
    models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5", "claude-opus-4-8"],
    requiresKey: true,
    keyPlaceholder: "sk-ant-…",
    baseUrlPlaceholder: "https://api.anthropic.com",
  },
  {
    key: "openai",
    label: "OpenAI",
    hint: "Schlüssel aus der OpenAI-Plattform (platform.openai.com).",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
    requiresKey: true,
    keyPlaceholder: "sk-…",
    baseUrlPlaceholder: "https://api.openai.com/v1",
  },
  {
    key: "demo",
    label: "Klarwerk Demo-Modus (regelbasiert)",
    hint: "Kein KI-Modell. Feste Regeln, überall als Demo gekennzeichnet.",
    defaultModel: "klarwerk-demo-rules-v1",
    models: ["klarwerk-demo-rules-v1"],
    requiresKey: false,
    keyPlaceholder: "",
    baseUrlPlaceholder: "",
  },
];

export const AI_PROVIDERS: Record<string, AIProviderCatalogEntry> = Object.fromEntries(
  AI_PROVIDER_LIST.map((entry) => [entry.key, entry]),
);

/** Anbieter, die einen Zugang brauchen – die also im Zugangsformular auftauchen. */
export const AI_KEY_PROVIDERS = AI_PROVIDER_LIST.filter((entry) => entry.requiresKey);

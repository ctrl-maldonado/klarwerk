/**
 * Übersetzt die hauseigenen JSON-Schemas in die Teilmenge, die Anthropics
 * Structured Outputs akzeptiert – und die Antwort wieder zurück.
 *
 * Zwei Unterschiede zu OpenAI:
 *
 * 1. Wertebereiche wie `minimum`/`maximum` oder `pattern` weist die API mit
 *    HTTP 400 zurück. Sie werden entfernt und als Hinweis in die Beschreibung
 *    geschrieben, damit das Modell die Vorgabe trotzdem kennt.
 * 2. Offene Zuordnungen (`additionalProperties` mit einem Schema, also ein
 *    Objekt mit beliebigen Schlüsseln) gibt es dort nicht. Sie werden als
 *    Textfeld mit JSON übertragen und nach der Antwort wieder eingelesen.
 *    Der Rest der Anwendung merkt davon nichts.
 */

type Schema = Record<string, unknown>;

/** Zahlen- und Zeichenketten-Grenzen, die die API nicht kennt. */
const DROPPED_CONSTRAINTS: Record<string, (value: unknown) => string> = {
  minimum: (value) => `mindestens ${value}`,
  maximum: (value) => `höchstens ${value}`,
  exclusiveMinimum: (value) => `größer als ${value}`,
  exclusiveMaximum: (value) => `kleiner als ${value}`,
  multipleOf: (value) => `Vielfaches von ${value}`,
  minLength: (value) => `mindestens ${value} Zeichen`,
  maxLength: (value) => `höchstens ${value} Zeichen`,
  pattern: (value) => `Muster ${value}`,
  maxItems: (value) => `höchstens ${value} Einträge`,
  uniqueItems: () => `ohne Wiederholungen`,
};

/** Nur diese String-Formate sind zulässig. */
const ALLOWED_FORMATS = new Set([
  "date-time",
  "time",
  "date",
  "duration",
  "email",
  "hostname",
  "uri",
  "ipv4",
  "ipv6",
  "uuid",
]);

function isSchema(value: unknown): value is Schema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Ein Objekt mit beliebigen Schlüsseln – `additionalProperties` ist ein Schema. */
function openMapValueSchema(schema: Schema): Schema | null {
  if (schema.type !== "object") return null;
  if (schema.properties) return null;
  return isSchema(schema.additionalProperties) ? schema.additionalProperties : null;
}

export function toAnthropicSchema(schema: Schema): Schema {
  return sortKeys(translate(schema)) as Schema;
}

/**
 * Feste Schlüsselreihenfolge.
 *
 * Klingt nach Kosmetik, ist aber notwendig: Die Komplexitätsprüfung der API
 * fällt bei inhaltlich identischen Schemas je nach Schlüsselreihenfolge
 * unterschiedlich aus („Schema is too complex", HTTP 400). Gemessen an diesem
 * Prompt-Katalog: unsortiert abgelehnt, sortiert angenommen. Eine feste
 * Reihenfolge macht das Verhalten außerdem reproduzierbar – und hält den
 * Prompt-Cache stabil.
 */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys); // Reihenfolge von Listen bleibt
  if (isSchema(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])]),
    );
  }
  return value;
}

function translate(schema: Schema): Schema {
  const result: Schema = {};
  // Schlüssel mitführen, damit die Hinweise unabhängig von der
  // Eingabereihenfolge immer gleich sortiert erscheinen.
  const notes: Array<[string, string]> = [];

  for (const [key, value] of Object.entries(schema)) {
    if (key in DROPPED_CONSTRAINTS) {
      // `uniqueItems: false` schränkt nichts ein und braucht keinen Hinweis.
      if (value !== false) notes.push([key, DROPPED_CONSTRAINTS[key](value)]);
      continue;
    }

    if (key === "minItems") {
      if (value === 0 || value === 1) result.minItems = value;
      else notes.push(["minItems", `mindestens ${value} Einträge`]);
      continue;
    }

    if (key === "format") {
      if (typeof value === "string" && ALLOWED_FORMATS.has(value)) result.format = value;
      else notes.push(["format", `Format ${value}`]);
      continue;
    }

    if (key === "additionalProperties") continue; // unten gesetzt
    if (key === "properties" && isSchema(value)) {
      result.properties = Object.fromEntries(
        Object.entries(value).map(([name, entry]) => [
          name,
          isSchema(entry) ? translate(entry) : entry,
        ]),
      );
      continue;
    }

    if (key === "items" && isSchema(value)) {
      result.items = translate(value);
      continue;
    }

    if ((key === "anyOf" || key === "allOf" || key === "oneOf") && Array.isArray(value)) {
      result[key] = value.map((entry) => (isSchema(entry) ? translate(entry) : entry));
      continue;
    }

    if ((key === "$defs" || key === "definitions") && isSchema(value)) {
      result[key] = Object.fromEntries(
        Object.entries(value).map(([name, entry]) => [
          name,
          isSchema(entry) ? translate(entry) : entry,
        ]),
      );
      continue;
    }

    result[key] = value;
  }

  // Offene Zuordnung → ein Textfeld mit JSON darin.
  //
  // Naheliegender wäre eine Liste aus `key`/`value`-Paaren. Die kostet aber
  // je Zuordnung ein weiteres verschachteltes Objektschema, und damit reißt
  // dieser Prompt Anthropics Grenze („Schema is too complex", HTTP 400).
  // Ein Textfeld kostet nichts; `fromAnthropicData` liest es wieder ein.
  const mapValue = openMapValueSchema(schema);
  if (mapValue) {
    const valueHint = typeof mapValue.type === "string" ? mapValue.type : "beliebig";
    return {
      type: "string",
      description: joinDescription(
        typeof schema.description === "string" ? schema.description : "",
        [`als JSON-Objekt in Textform, Werte vom Typ ${valueHint}, z. B. {"schluessel":"wert"}`],
      ),
    };
  }

  if (result.type === "object") {
    result.additionalProperties = false;
  }

  if (notes.length) {
    const ordered = [...notes].sort((a, b) => a[0].localeCompare(b[0])).map(([, text]) => text);
    result.description = joinDescription(
      typeof result.description === "string" ? result.description : "",
      ordered,
    );
  }

  return result;
}

function joinDescription(existing: string, notes: string[]): string {
  const hint = notes.join(", ");
  return existing ? `${existing} (${hint})` : hint;
}

/**
 * Macht die Umschreibungen aus `toAnthropicSchema` rückgängig.
 * Richtschnur ist das *ursprüngliche* Schema.
 */
export function fromAnthropicData(data: unknown, schema: Schema): unknown {
  const mapValue = openMapValueSchema(schema);
  if (mapValue) {
    const source = typeof data === "string" ? parseObject(data) : data;
    // Liefert das Modell trotz Vorgabe eine Paar-Liste, wird auch die gelesen.
    if (Array.isArray(source)) {
      const rebuilt: Record<string, unknown> = {};
      for (const entry of source) {
        if (isSchema(entry) && typeof entry.key === "string") {
          rebuilt[entry.key] = fromAnthropicData(entry.value, mapValue);
        }
      }
      return rebuilt;
    }
    if (!isSchema(source)) return {};
    return Object.fromEntries(
      Object.entries(source).map(([name, value]) => [name, fromAnthropicData(value, mapValue)]),
    );
  }

  if (isSchema(schema.properties) && isSchema(data)) {
    const properties = schema.properties;
    const rebuilt: Record<string, unknown> = { ...data };
    for (const [name, entry] of Object.entries(properties)) {
      if (name in rebuilt && isSchema(entry)) {
        rebuilt[name] = fromAnthropicData(rebuilt[name], entry);
      }
    }
    return rebuilt;
  }

  if (schema.type === "array" && isSchema(schema.items) && Array.isArray(data)) {
    const items = schema.items;
    return data.map((entry) => fromAnthropicData(entry, items));
  }

  return data;
}

/** Liest ein JSON-Objekt aus Text. Unlesbares ergibt eine leere Zuordnung, keinen Fehler. */
function parseObject(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    return {};
  }
}

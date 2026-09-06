import { describe, expect, it } from "vitest";
import { fromAnthropicData, toAnthropicSchema } from "@/modules/ai/providers/anthropic-schema";
import { PROMPTS } from "@/modules/ai/prompt-catalog";

/**
 * Anthropics Structured Outputs kennen nur eine Teilmenge von JSON Schema.
 * Was hier durchrutscht, quittiert die API mit HTTP 400 – erst zur Laufzeit,
 * mitten in der Bearbeitung einer Kundenanfrage.
 */
describe("Schema-Übersetzung für Anthropic", () => {
  it("entfernt Wertebereiche und rettet die Vorgabe in die Beschreibung", () => {
    const result = toAnthropicSchema({
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "Vertrauenswert zwischen 0 und 1.",
    });

    expect(result.minimum).toBeUndefined();
    expect(result.maximum).toBeUndefined();
    expect(result.type).toBe("number");
    expect(String(result.description)).toContain("mindestens 0");
    expect(String(result.description)).toContain("höchstens 1");
  });

  it("entfernt Zeichenketten- und Listengrenzen", () => {
    const result = toAnthropicSchema({
      type: "object",
      properties: {
        name: { type: "string", minLength: 2, maxLength: 80, pattern: "^[A-Z]" },
        tags: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 9 },
        wenige: { type: "array", items: { type: "string" }, minItems: 1 },
      },
    });

    const properties = result.properties as Record<string, Record<string, unknown>>;
    for (const key of ["minLength", "maxLength", "pattern"]) {
      expect(properties.name[key]).toBeUndefined();
    }
    expect(properties.tags.minItems).toBeUndefined();
    expect(properties.tags.maxItems).toBeUndefined();
    // 0 und 1 sind erlaubt und bleiben erhalten.
    expect(properties.wenige.minItems).toBe(1);
  });

  it("behält nur zulässige String-Formate", () => {
    const result = toAnthropicSchema({
      type: "object",
      properties: {
        email: { type: "string", format: "email" },
        telefon: { type: "string", format: "phone" },
      },
    });

    const properties = result.properties as Record<string, Record<string, unknown>>;
    expect(properties.email.format).toBe("email");
    expect(properties.telefon.format).toBeUndefined();
  });

  it("setzt additionalProperties bei jedem Objekt auf false", () => {
    const result = toAnthropicSchema({
      type: "object",
      properties: { innen: { type: "object", properties: { a: { type: "string" } } } },
    });

    expect(result.additionalProperties).toBe(false);
    const inner = (result.properties as Record<string, Record<string, unknown>>).innen;
    expect(inner.additionalProperties).toBe(false);
  });

  it("überträgt offene Zuordnungen als Textfeld und setzt sie zurück", () => {
    const original = {
      type: "object",
      properties: {
        customFields: { type: "object", additionalProperties: { type: "string" } },
        fieldConfidence: {
          type: "object",
          additionalProperties: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    };

    const translated = toAnthropicSchema(original);
    const properties = translated.properties as Record<string, Record<string, unknown>>;
    // Ein Textfeld statt eines verschachtelten Objekts – sonst reißt der
    // Prompt Anthropics Komplexitätsgrenze.
    expect(properties.customFields.type).toBe("string");
    expect(properties.fieldConfidence.type).toBe("string");
    expect(String(properties.customFields.description)).toContain("JSON-Objekt");

    const answer = {
      customFields: '{"anlagentyp":"Brennwert","baujahr":"2011"}',
      fieldConfidence: '{"anlagentyp":0.9}',
    };

    expect(fromAnthropicData(answer, original)).toEqual({
      customFields: { anlagentyp: "Brennwert", baujahr: "2011" },
      fieldConfidence: { anlagentyp: 0.9 },
    });
  });

  it("verkraftet eine Zuordnung, die das Modell anders liefert", () => {
    const schema = {
      type: "object",
      properties: { customFields: { type: "object", additionalProperties: { type: "string" } } },
    };

    // Objekt statt Text.
    expect(fromAnthropicData({ customFields: { a: "1" } }, schema)).toEqual({
      customFields: { a: "1" },
    });
    // Paar-Liste statt Text.
    expect(fromAnthropicData({ customFields: [{ key: "a", value: "1" }] }, schema)).toEqual({
      customFields: { a: "1" },
    });
    // Kaputtes JSON darf nicht die ganze Antwort verlieren.
    expect(fromAnthropicData({ customFields: "{kaputt" }, schema)).toEqual({ customFields: {} });
  });

  it("lässt eine Antwort ohne offene Zuordnungen unverändert", () => {
    const schema = {
      type: "object",
      properties: { issue: { type: "string" }, confidence: { type: "number", minimum: 0 } },
    };
    const answer = { issue: "Kein Warmwasser", confidence: 0.82 };
    expect(fromAnthropicData(answer, schema)).toEqual(answer);
  });

  it("erzeugt aus jedem Katalog-Prompt ein zulässiges Schema", () => {
    const forbidden = [
      "minimum",
      "maximum",
      "exclusiveMinimum",
      "exclusiveMaximum",
      "multipleOf",
      "minLength",
      "maxLength",
      "pattern",
      "maxItems",
      "uniqueItems",
    ];

    for (const prompt of PROMPTS) {
      if (!prompt.jsonSchema) continue;
      const translated = toAnthropicSchema(prompt.jsonSchema);
      walk(translated, (node) => {
        for (const key of forbidden) {
          expect(node[key], `${prompt.key}: ${key} ist nicht zulässig`).toBeUndefined();
        }
        if (node.type === "object") {
          expect(node.additionalProperties, `${prompt.key}: offenes Objekt`).toBe(false);
        }
        if ("minItems" in node) {
          expect([0, 1]).toContain(node.minItems);
        }
      });
    }
  });
});

function walk(node: Record<string, unknown>, visit: (node: Record<string, unknown>) => void): void {
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (isRecord(entry)) walk(entry, visit);
      }
    } else if (isRecord(value)) {
      // `properties`/`$defs` sind Sammlungen von Schemas, keine Schemas selbst –
      // der Besuch schadet nicht, weil die Prüfungen nur auf Schlüssel achten.
      walk(value, visit);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Die Komplexitätsprüfung der API fällt bei inhaltlich identischen Schemas je
 * nach Schlüsselreihenfolge unterschiedlich aus. Deshalb muss die Ausgabe
 * unabhängig von der Eingabereihenfolge immer gleich aussehen.
 */
describe("Feste Schlüsselreihenfolge", () => {
  it("liefert für dieselbe Bedeutung dasselbe Ergebnis", () => {
    const a = {
      type: "object",
      properties: { b: { type: "string" }, a: { type: "number", minimum: 0, maximum: 1 } },
      required: ["a"],
    };
    const b = {
      required: ["a"],
      properties: { a: { maximum: 1, minimum: 0, type: "number" }, b: { type: "string" } },
      type: "object",
    };

    expect(JSON.stringify(toAnthropicSchema(a))).toBe(JSON.stringify(toAnthropicSchema(b)));
  });

  it("lässt die Reihenfolge von Listen unangetastet", () => {
    const result = toAnthropicSchema({
      type: "string",
      enum: ["URGENT", "HIGH", "NORMAL", "LOW"],
    });
    expect(result.enum).toEqual(["URGENT", "HIGH", "NORMAL", "LOW"]);
  });
});

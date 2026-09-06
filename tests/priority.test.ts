import { describe, expect, it } from "vitest";
import { determinePriority, maxPriority } from "@/modules/orders/service";
import { getIndustryProfile } from "@/modules/industry/profiles";

describe("Prioritätsregeln", () => {
  const shk = getIndustryProfile("plumbing_heating");
  const electrical = getIndustryProfile("electrical");

  it("hebt bei Notfallwörtern auf die höchste Stufe an", () => {
    const result = determinePriority("Im Keller steht Wasser, Rohrbruch!", "NORMAL", shk, "water_damage");
    expect(result.priority).toBe("URGENT");
    expect(result.escalated).toBe(true);
  });

  it("senkt eine vom Modell hoch eingestufte Priorität nicht ab", () => {
    const result = determinePriority("Angebot für ein neues Bad", "HIGH", shk, "sanitary_installation");
    expect(result.priority).toBe("HIGH");
  });

  it("verwendet die Mindestpriorität der Kategorie", () => {
    const result = determinePriority("Heizung heizt nicht", "LOW", shk, "heating_failure");
    expect(result.priority).toBe("HIGH");
    expect(result.reasons.join(" ")).toContain("Heizungsausfall");
  });

  it("nutzt je Branche unterschiedliche Kategorien", () => {
    const result = determinePriority("Es fliegt dauernd die Sicherung raus", "NORMAL", electrical, "power_failure");
    expect(result.priority).toBe("URGENT");
  });

  it("liefert eine nachvollziehbare Begründung", () => {
    const result = determinePriority("Bitte um Angebot", "NORMAL", shk, "quote_request");
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("vergleicht Prioritäten korrekt", () => {
    expect(maxPriority("LOW", "URGENT")).toBe("URGENT");
    expect(maxPriority("HIGH", "NORMAL")).toBe("HIGH");
  });
});

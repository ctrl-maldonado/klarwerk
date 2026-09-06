import {
  containsKeyword,
  countKeywords,
  extractDateWish,
  extractEmail,
  extractPersonName,
  extractPhone,
  extractStreet,
  extractZipCity,
  normalize,
} from "../text-analysis";
import type { AICompletionRequest, AICompletionResult, AIProvider } from "./types";

/**
 * DEMO-PROVIDER (§42).
 *
 * Dies ist KEIN Sprachmodell. Es ist eine regelbasierte Nachbildung, damit die
 * Anwendung ohne API-Key vollständig vorführbar bleibt. Jedes Ergebnis wird mit
 * `isDemo: true` markiert und in der Oberfläche sowie im Protokoll als
 * "Demo-Modus" ausgewiesen. Ergebnisse werden nie als echte Modellausgabe
 * dargestellt.
 */
export class DemoProvider implements AIProvider {
  readonly key = "demo";
  readonly label = "Klarwerk Demo-Modus (regelbasiert, kein KI-Modell)";
  readonly isDemo = true;
  readonly model = "klarwerk-demo-rules-v1";

  isConfigured(): boolean {
    return true;
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    const started = Date.now();
    const context = (request.context ?? {}) as Record<string, any>;
    let data: Record<string, unknown>;

    switch (request.taskKey) {
      case "email_classify":
        data = this.classify(context);
        break;
      case "request_extract":
        data = this.extract(context);
        break;
      case "customer_match":
        data = { customerId: "", confidence: 0, reason: "Im Demo-Modus übernimmt der Abgleich die regelbasierte Suche.", isNewCustomer: true };
        break;
      case "reply_draft":
        data = this.reply(context);
        break;
      case "appointment_reason":
        data = this.chooseSlot(context);
        break;
      case "document_extract":
        data = this.document(context);
        break;
      case "assistant_chat":
        data = { answer: this.chatAnswer(context) };
        break;
      default:
        data = {
          error: `Für die Aufgabe "${request.taskKey}" gibt es im Demo-Modus keine Regel.`,
          confidence: 0,
        };
    }

    const text = JSON.stringify(data);
    return {
      text: request.taskKey === "assistant_chat" ? String(data.answer ?? "") : text,
      data,
      toolCalls: [],
      model: this.model,
      providerKey: this.key,
      isDemo: true,
      inputTokens: 0,
      outputTokens: 0,
      costMicroCents: 0,
      latencyMs: Date.now() - started,
    };
  }

  private classify(context: Record<string, any>) {
    const text = `${context.subject ?? ""} ${context.body ?? ""}`;
    const categories: Array<{ key: string; label: string; aiHint?: string }> = context.categories ?? [];

    const signals: Record<string, string[]> = {
      spam: ["newsletter", "abmelden", "werbung", "gewinnspiel", "seo-optimierung", "backlinks"],
      complaint: ["reklamation", "beschwerde", "mangel", "unzufrieden", "nachbessern", "pfusch"],
      invoice: ["rechnung", "mahnung", "zahlung", "überweisung", "zahlungserinnerung"],
      quote: ["angebot", "kostenvoranschlag", "was kostet", "preis", "kalkulation"],
      appointment: ["termin", "verschieben", "absagen", "uhrzeit", "wann kommen sie"],
      existing_order: ["auftragsnummer", "bestehender auftrag", "wie besprochen", "letzte woche waren sie", "ihr monteur"],
      new_request: ["funktioniert nicht", "defekt", "kaputt", "problem", "können sie", "brauchen wir", "hilfe", "störung", "ausgefallen"],
      general_question: ["frage", "information", "wissen wollte", "können sie mir sagen"],
    };

    let bestKey = "other";
    let bestScore = 0;
    for (const category of categories) {
      const keywords = signals[category.key] ?? [];
      const score = countKeywords(text, keywords);
      if (score > bestScore) {
        bestScore = score;
        bestKey = category.key;
      }
    }

    if (bestScore === 0 && categories.some((c) => c.key === "new_request")) {
      bestKey = "new_request";
    }

    const confidence = bestScore === 0 ? 0.45 : Math.min(0.6 + bestScore * 0.12, 0.92);
    return {
      categoryKey: bestKey,
      confidence,
      reason:
        bestScore === 0
          ? "Keine eindeutigen Signalwörter gefunden – bitte manuell prüfen."
          : `${bestScore} passende Signalwörter für Kategorie "${bestKey}" gefunden.`,
      isSpam: bestKey === "spam",
    };
  }

  private extract(context: Record<string, any>) {
    const body: string = context.body ?? "";
    const subject: string = context.subject ?? "";
    const text = `${subject}\n${body}`;
    const categories: Array<{ key: string; label: string; keywords: string[]; defaultPriority: string; estimatedMinutes: number }> =
      context.orderCategories ?? [];

    let categoryKey = "other";
    let categoryScore = 0;
    let estimatedDurationMinutes = 60;
    for (const category of categories) {
      const score = countKeywords(text, category.keywords ?? []);
      if (score > categoryScore) {
        categoryScore = score;
        categoryKey = category.key;
        estimatedDurationMinutes = category.estimatedMinutes ?? 60;
      }
    }
    if (categoryScore === 0) {
      const fallback = categories.find((category) => category.key === "other") ?? categories[0];
      categoryKey = fallback?.key ?? "other";
      estimatedDurationMinutes = fallback?.estimatedMinutes ?? 60;
    }

    const matchedCategory = categories.find((category) => category.key === categoryKey);
    const priority = (matchedCategory?.defaultPriority as string) ?? "NORMAL";

    const wish = extractDateWish(text, context.now ? new Date(context.now) : new Date());
    const street = extractStreet(text);
    const { zip, city } = extractZipCity(text);
    const email = extractEmail(body) ?? context.fromEmail;
    const phone = extractPhone(body);
    const customerName = extractPersonName(context.fromName ?? "", body);

    const missingInformation: string[] = [];
    if (!street) missingInformation.push("Vollständige Einsatzadresse");
    if (!phone) missingInformation.push("Telefonnummer für Rückfragen");
    if (!wish.date && !wish.asap) missingInformation.push("Terminwunsch");

    const meaningfulLine =
      body
        .split(/\n+/)
        .map((line) => line.trim())
        .find(
          (line) =>
            line.length > 25 &&
            !/^(hallo|guten tag|sehr geehrte|mit freundlichen|viele gruesse|beste gruesse)/i.test(normalize(line)),
        ) ?? subject;
    // Erster vollständiger Satz genügt als Kurzbeschreibung.
    const issueLine = (meaningfulLine.split(/(?<=[.!?])\s+/)[0] ?? meaningfulLine).trim();

    const fieldConfidence: Record<string, number> = {
      customerName: customerName ? 0.7 : 0.2,
      email: email ? 0.95 : 0.1,
      phone: phone ? 0.85 : 0.1,
      street: street ? 0.8 : 0.15,
      zip: zip ? 0.85 : 0.15,
      city: city ? 0.75 : 0.15,
      categoryKey: categoryScore === 0 ? 0.4 : Math.min(0.6 + categoryScore * 0.1, 0.9),
      priority: 0.65,
      requestedDate: wish.date ? 0.7 : 0.2,
    };

    const values = Object.values(fieldConfidence);
    const confidence = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;

    return {
      customerName: customerName ?? "",
      companyName: "",
      email: email ?? "",
      phone: phone ?? "",
      street: street ?? "",
      zip: zip ?? "",
      city: city ?? "",
      issue: issueLine.slice(0, 200),
      categoryKey,
      priority,
      requestedDate: wish.date ? wish.date.toISOString() : "",
      requestedTimeOfDay: wish.timeOfDay,
      estimatedDurationMinutes,
      customFields: {},
      missingInformation,
      summary: [
        matchedCategory?.label ?? "Anfrage",
        street || city ? `in ${[street, city].filter(Boolean).join(", ")}` : "",
        wish.asap ? "Kunde bittet um schnelle Hilfe" : "",
      ]
        .filter(Boolean)
        .join(" · "),
      fieldConfidence,
      confidence,
    };
  }

  private reply(context: Record<string, any>) {
    const companyName: string = context.companyName ?? "Ihr Handwerksbetrieb";
    const customerName: string = context.customerName ?? "";
    const appointmentText: string = context.appointmentText ?? "";
    const missing: string[] = context.missingInformation ?? [];
    const signature: string = context.signature || companyName;
    const salutation = customerName ? `Hallo ${customerName},` : "Guten Tag,";

    const lines = [salutation, "", "vielen Dank für Ihre Nachricht."];
    if (appointmentText) lines.push("", `Wir können Ihnen folgenden Termin anbieten: ${appointmentText}.`, "Bitte bestätigen Sie uns diesen Termin kurz.");
    else lines.push("", "Wir melden uns kurzfristig mit einem Terminvorschlag bei Ihnen.");
    if (missing.length) lines.push("", `Damit wir den Einsatz vorbereiten können, benötigen wir noch: ${missing.join(", ")}.`);
    lines.push("", "Viele Grüße", signature);

    return {
      subject: context.subject ? `Re: ${context.subject}` : "Ihre Anfrage",
      body: lines.join("\n"),
      confidence: 0.6,
    };
  }

  private chooseSlot(context: Record<string, any>) {
    const slots: Array<{ id: string; start: string; employeeName?: string; score?: number }> = context.slots ?? [];
    if (!slots.length) {
      return { slotId: "", reason: "Es wurden keine freien Zeitfenster übergeben.", confidence: 0 };
    }
    const best = [...slots].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
    return {
      slotId: best.id,
      reason: `Frühestes passendes Zeitfenster${best.employeeName ? ` bei ${best.employeeName}` : ""}.`,
      confidence: 0.65,
    };
  }

  private document(context: Record<string, any>) {
    const content: string = context.content ?? "";
    const filename: string = context.filename ?? "";
    const type = containsKeyword(`${filename} ${content}`, ["rechnung"])
      ? "Rechnung"
      : containsKeyword(`${filename} ${content}`, ["angebot", "kostenvoranschlag"])
        ? "Angebot"
        : containsKeyword(`${filename} ${content}`, ["lieferschein"])
          ? "Lieferschein"
          : "Sonstiges";
    const amount = content.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:€|EUR)/)?.[1];
    const reference = content.match(/\b(?:Nr\.?|Nummer)\s*([A-Z0-9-]{3,})/i)?.[1];
    return {
      documentType: type,
      customerName: "",
      reference: reference ?? "",
      totalAmount: amount ?? "",
      date: "",
      summary: `${type}${amount ? ` über ${amount} €` : ""} (regelbasiert erkannt).`,
      confidence: 0.5,
    };
  }

  private chatAnswer(context: Record<string, any>): string {
    return [
      "Der Demo-Modus beantwortet keine freien Fragen – dafür wird ein echtes KI-Modell benötigt.",
      "Hinterlegen Sie einen API-Key unter Einstellungen › AI, um den Assistenten zu nutzen.",
      context.message ? `Ihre Frage war: „${String(context.message).slice(0, 200)}"` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }
}

/**
 * Deterministische Textwerkzeuge.
 * Werden vom Demo-Provider genutzt und – unabhängig vom Modell – für
 * Sicherheitsregeln (z.B. Notfall-Eskalation) und Kunden-Fuzzy-Matching.
 */

export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9@.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function containsKeyword(text: string, keywords: string[]): string | null {
  const haystack = normalize(text);
  for (const keyword of keywords) {
    const needle = normalize(keyword);
    if (needle && haystack.includes(needle)) return keyword;
  }
  return null;
}

export function countKeywords(text: string, keywords: string[]): number {
  const haystack = normalize(text);
  return keywords.reduce((total, keyword) => {
    const needle = normalize(keyword);
    return needle && haystack.includes(needle) ? total + 1 : total;
  }, 0);
}

export function extractEmail(text: string): string | undefined {
  return text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
}

export function extractPhone(text: string): string | undefined {
  const match = text.match(/(?:\+49|0)[\d\s/()-]{6,20}\d/);
  return match?.[0].trim();
}

export function extractZipCity(text: string): { zip?: string; city?: string } {
  const match = text.match(/\b(\d{5})\s+([A-ZÄÖÜ][\wäöüß-]+(?:[ -][A-ZÄÖÜ][\wäöüß-]+)?)/);
  if (match) {
    // Ein Satzende beendet den Ortsnamen – "40721 Hilden. Bitte" ist nicht "Hilden Bitte".
    const city = match[2].split(/[.,;!?]/)[0].trim();
    return { zip: match[1], city: city || undefined };
  }
  const zipOnly = text.match(/\b\d{5}\b/);
  return { zip: zipOnly?.[0] };
}

export function extractStreet(text: string): string | undefined {
  // Auch Formen wie "Am Bahndamm 8" oder "An der Mühle 2" werden vollständig erfasst.
  const match = text.match(
    /\b((?:Am|An der|Im|In der|Auf der|Zum|Zur)\s+)?([A-ZÄÖÜ][\wäöüß.-]*(?:straße|strasse|str\.?|weg|allee|platz|gasse|ring|damm|ufer)\s*\d+(?:\s?[a-zA-Z]\b(?![a-zA-Z]))?)/i,
  );
  if (!match) return undefined;
  // Nur ein großgeschriebener Artikel gehört zum Straßennamen ("Am Bahndamm"),
  // eine kleingeschriebene Präposition davor nicht ("in der Hauptstraße").
  const article = match[1] && /^[A-ZÄÖÜ]/.test(match[1]) ? match[1] : "";
  return `${article}${match[2]}`.replace(/\s+/g, " ").trim();
}

const WEEKDAYS = ["sonntag", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"];

export interface DateWish {
  date?: Date;
  timeOfDay: "morning" | "afternoon" | "evening" | "any";
  asap: boolean;
  raw?: string;
}

/** Erkennt Terminwünsche wie "Donnerstag Nachmittag", "morgen früh", "so schnell wie möglich". */
export function extractDateWish(text: string, now = new Date()): DateWish {
  const haystack = normalize(text);
  const result: DateWish = { timeOfDay: "any", asap: false };

  if (/(so schnell wie moeglich|schnellstmoeglich|dringend|sofort|notfall|umgehend|heute noch)/.test(haystack)) {
    result.asap = true;
  }

  if (/(vormittag|morgens|frueh|am morgen)/.test(haystack)) result.timeOfDay = "morning";
  else if (/(nachmittag|nachmittags)/.test(haystack)) result.timeOfDay = "afternoon";
  else if (/(abend|abends)/.test(haystack)) result.timeOfDay = "evening";

  const startOfDay = (date: Date) => {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };

  if (/\buebermorgen\b/.test(haystack)) {
    const date = startOfDay(now);
    date.setDate(date.getDate() + 2);
    result.date = date;
    result.raw = "übermorgen";
    return result;
  }
  if (/\bmorgen\b/.test(haystack) && !/vormittag|morgens/.test(haystack.replace(/\bmorgen\b/, ""))) {
    const date = startOfDay(now);
    date.setDate(date.getDate() + 1);
    result.date = date;
    result.raw = "morgen";
    return result;
  }
  if (/\bheute\b/.test(haystack)) {
    result.date = startOfDay(now);
    result.raw = "heute";
    return result;
  }

  const explicit = text.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})?\b/);
  if (explicit) {
    const day = Number(explicit[1]);
    const month = Number(explicit[2]) - 1;
    const year = explicit[3] ? Number(explicit[3].length === 2 ? `20${explicit[3]}` : explicit[3]) : now.getFullYear();
    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime())) {
      result.date = date;
      result.raw = explicit[0];
      return result;
    }
  }

  for (let index = 0; index < WEEKDAYS.length; index += 1) {
    if (haystack.includes(WEEKDAYS[index])) {
      const date = startOfDay(now);
      let delta = (index - date.getDay() + 7) % 7;
      if (delta === 0) delta = 7;
      date.setDate(date.getDate() + delta);
      result.date = date;
      result.raw = WEEKDAYS[index];
      return result;
    }
  }

  return result;
}

/** Ähnlichkeit zweier Zeichenketten (0..1), Levenshtein-basiert. */
export function similarity(a: string, b: string): number {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const matrix: number[][] = Array.from({ length: left.length + 1 }, (_, i) =>
    Array.from({ length: right.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }

  const distance = matrix[left.length][right.length];
  return 1 - distance / Math.max(left.length, right.length);
}

export function extractPersonName(fromName: string, body: string): string | undefined {
  if (fromName && /[A-Za-zÄÖÜäöüß]{2,}\s+[A-Za-zÄÖÜäöüß]{2,}/.test(fromName)) return fromName.trim();
  const signature = body.match(
    /(?:mit freundlichen gr[üu][ßs]en|viele gr[üu][ßs]e|beste gr[üu][ßs]e|gru[ßs]|lg)[,\s]*\n+\s*([A-ZÄÖÜ][\wäöüß-]+(?:\s+[A-ZÄÖÜ][\wäöüß-]+)+)/i,
  );
  if (signature) return signature[1].trim();
  const intro = body.match(/(?:ich bin|mein name ist|hier ist)\s+([A-ZÄÖÜ][\wäöüß-]+(?:\s+[A-ZÄÖÜ][\wäöüß-]+)+)/i);
  return intro?.[1]?.trim() || (fromName.trim() || undefined);
}

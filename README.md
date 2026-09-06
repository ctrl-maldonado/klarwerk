# Klarwerk

**Der digitale Mitarbeiter für Handwerksbetriebe.**

Eine Kundenanfrage kommt per E-Mail herein. Klarwerk liest sie, versteht das Anliegen, ordnet den
Kunden zu, legt den Auftrag an, sucht einen passenden Termin und schreibt die Antwort.
Die Mitarbeiterin oder der Mitarbeiter drückt **„Alles bestätigen"**.

```
E-Mail kommt rein → Klarwerk versteht sie → Klarwerk bereitet alles vor → Mitarbeiter bestätigt
```

---

## In 5 Minuten starten

Voraussetzungen: Node 20+, Docker (für PostgreSQL).

```bash
npm install
npm run setup          # .env anlegen, Geheimnisse erzeugen
npm run db:up          # PostgreSQL und Redis starten
npm run db:push        # Datenmodell anlegen
npm run db:seed        # Demo-Betrieb mit Kunden, Aufträgen und Anfragen
npm run dev
```

Ein API-Schlüssel wird nicht gebraucht: ohne Schlüssel läuft Klarwerk im
gekennzeichneten Demo-Modus (siehe *Ohne KI-Modell*).

Anmeldung im Demo-Betrieb *Muster Heizungs- & Sanitär GmbH*:

| Rolle        | E-Mail                   | Passwort        |
|--------------|--------------------------|-----------------|
| Inhaber      | `max@muster-shk.de`      | `Klarwerk2026!` |
| Büroleitung  | `buero@muster-shk.de`    | `Klarwerk2026!` |
| Techniker    | `stefan@muster-shk.de`   | `Klarwerk2026!` |

Für die Hintergrundverarbeitung (Postfachabruf, Aufbewahrungsfristen, Wiederholungen) zusätzlich:

```bash
npm run worker
```

### Den Ablauf selbst ausprobieren

1. **E-Mails → Anfrage erfassen** öffnen und eine Nachricht eintippen, zum Beispiel:
   *„Hallo, unsere Heizung funktioniert seit gestern nicht mehr. Wir wohnen in der Hauptstraße 15
   und brauchen möglichst schnell Hilfe. Donnerstag nachmittags wären wir da."*
2. Klarwerk ordnet ein, liest Adresse und Terminwunsch aus, sucht den Kunden, bereitet Auftrag,
   Termin und Antwort vor.
3. Unter **Freigaben** steht der fertige Vorschlag mit Vertrauenswerten je Schritt.
4. **Alles bestätigen** – Auftrag, Termin und Antwortentwurf entstehen, jede Aktion landet im **Protokoll**.

---

## Ein KI-Modell anschließen

Klarwerk spricht **Anthropic (Claude)** und **OpenAI**. Der Zugang wird pro Betrieb unter
**Einstellungen › AI** hinterlegt: oben der aktive Anbieter, darunter Modell und Schlüssel.
Ein neu gespeicherter Schlüssel schaltet diesen Anbieter zugleich aktiv – ein gespeicherter,
aber wirkungsloser Zugang kann so nicht entstehen.

Alternativ über die Umgebung, für alle Betriebe:

```bash
ANTHROPIC_API_KEY="sk-ant-…"
ANTHROPIC_MODEL="claude-opus-5"    # oder claude-sonnet-5, claude-haiku-4-5
ANTHROPIC_EFFORT="low"             # low | medium | high | xhigh | max
```

`ANTHROPIC_EFFORT` steuert, wie gründlich das Modell nachdenkt. Einordnen und Auslesen sind
kurze, häufige Aufgaben mit wartenden Nutzern – dafür ist `low` die passende Stufe. Für
schwierigere Aufgaben lohnt `high` oder `max`, zu höheren Kosten und längerer Wartezeit.

Bei einer Ablehnung durch die Sicherheitsprüfung des Modells wiederholt die API die Anfrage
serverseitig auf einem Ausweichmodell (`fallbacks`), statt ohne Ergebnis abzubrechen.

```bash
ANTHROPIC_THINKING="an"            # "aus" schaltet das Nachdenken ab
ANTHROPIC_MAX_RETRIES="1"          # stille Wiederholungen bei Rate-Limits
ANTHROPIC_TIMEOUT_SECONDS="60"
```

### Antwortzeiten

Gemessen an einer typischen Anfrage (Auslesen einer Kunden-E-Mail, ~1600 Token Eingabe):

| Modell           | Zeit je Aufruf |
|------------------|----------------|
| `claude-sonnet-5`  | 3,8 – 4,7 s    |
| `claude-haiku-4-5` | 4,7 s          |
| `claude-opus-5`    | 5,6 s          |

Der Unterschied zwischen den Modellen ist klein; die Zeit steckt im festen Aufwand je Aufruf.
Entscheidend ist deshalb die **Anzahl** der Aufrufe: Die Verarbeitung einer E-Mail durchläuft die
Schritte in `workflows/engine.ts` nacheinander, jeder mit einem eigenen Modellaufruf (Einordnen,
Auslesen, Termin, Antwortentwurf). Wie viele es werden, hängt davon ab, welche Bedingungen greifen.

**Einordnung wird geteilt.** Eine eingehende Nachricht löst jede passende Automation aus, und viele
beginnen mit demselben Schritt `ai_classify_email`. Der erste Lauf befragt das Modell, alle weiteren
Läufe zur selben Nachricht übernehmen das Ergebnis (`SharedEmailResults` in `engine.ts`). Das
Protokoll weist übernommene Einordnungen als solche aus. Gemessen an zwei Automationen auf
`EMAIL_RECEIVED`: 2,8 s statt 7 s, ein Modellaufruf statt zwei.

Ausreißer von 30 bis 70 Sekunden gehen fast immer auf **Rate-Limits** zurück: Das SDK wiederholt
still mit wachsendem Abstand. `ANTHROPIC_MAX_RETRIES="1"` begrenzt das, damit ein Limit als Fehler
sichtbar wird, statt als minutenlanges Warten.

### Schemas: was bei Anthropic anders ist

Anthropics Structured Outputs kennen nur eine Teilmenge von JSON Schema. `providers/anthropic-schema.ts`
übersetzt beim Senden und wandelt die Antwort zurück; die Prompts im Katalog bleiben unverändert und
gelten für beide Anbieter. Drei Punkte:

- **Wertebereiche** (`minimum`, `maximum`, `pattern`, `maxItems` …) werden entfernt und als Hinweis in
  die Feldbeschreibung geschrieben, damit das Modell die Vorgabe trotzdem kennt.
- **Offene Zuordnungen** (`additionalProperties` mit Schema, etwa `customFields`) gibt es dort nicht.
  Sie werden als Textfeld mit JSON übertragen und danach wieder eingelesen.
- **Feste Schlüsselreihenfolge.** Die Komplexitätsprüfung der API antwortet auf inhaltlich identische
  Schemas nicht immer gleich – dasselbe Schema wurde mit einer Schlüsselreihenfolge angenommen und mit
  einer anderen mit `Schema is too complex` (HTTP 400) abgelehnt. Die Übersetzung sortiert deshalb
  kanonisch. Das macht die Anfrage reproduzierbar, ist aber keine Garantie: Wird das Schema doch
  abgelehnt, verlangt der Provider dieselbe Struktur einmalig per Anweisung im Prompt, statt die
  Bearbeitung scheitern zu lassen.

## Ohne KI-Modell: Demo-Modus

Ist kein Zugang hinterlegt, läuft Klarwerk in einem **regelbasierten Demo-Modus**.
Der ist überall sichtbar gekennzeichnet – in der Seitenleiste, auf dem Dashboard, auf jeder Freigabe
und in jedem Protokolleintrag (`isDemo`). Es wird **kein Modellergebnis vorgetäuscht**;
Aufgaben ohne Regel melden das offen. Ein API-Aufruf ohne Zugangsdaten scheitert mit
`AI provider not configured.` statt still etwas zu erfinden.

Der Schlüssel wird mit AES-256-GCM verschlüsselt gespeichert und niemals an den Browser ausgeliefert.

---

## Technik

| Bereich       | Umsetzung                                                        |
|---------------|------------------------------------------------------------------|
| Frontend      | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4     |
| Backend       | Server Actions und Route Handler, API-first unter `/api/v1`       |
| Datenbank     | PostgreSQL mit Prisma                                            |
| AI            | Provider-Abstraktion; Anthropic, OpenAI, Demo-Modus, weitere anschließbar |
| E-Mail        | Microsoft Graph, Gmail, Intake-Schnittstelle, Demo-Postfach       |
| Dateien       | Lokal oder S3-kompatibel                                          |
| Warteschlange | Datenbankgestützt mit Wiederholung, Backoff und Idempotenz        |
| Deployment    | Docker (`docker compose --profile full up`)                       |

### Module

```
src/modules/
  auth/          Anmeldung, Sitzungen, Rollen
  tenants/       Mandanten, Branchenprofile, Grundkonfiguration
  industry/      Branchenkatalog (Kategorien, Regeln, Felder) – als Daten, nicht als Code
  customers/     Stammdaten, unscharfe Kundenzuordnung
  orders/        Aufträge, Nummernkreise, Prioritätsregeln
  calendar/      Terminfindung (Arbeitszeiten, Urlaub, Qualifikation, Region, Fahrtzeit)
  email/         Postfachanbindung, Versand, Provider
  documents/     Upload, Textextraktion, Auswertung, Speicher
  workflows/     Automations-Engine (Auslöser, Bedingungen, Aktionen)
  ai/            Provider, Prompts, Werkzeugkatalog, Assistent
  approvals/     Freigaben und deren Ausführung
  audit/         Protokoll (nur schreibend)
  privacy/       Export, Löschung, Aufbewahrung
  billing/       Tarife, Verbrauch, Limits
  analytics/     Kennzahlen, Zeitersparnis
  notifications/ Benachrichtigungen
  jobs/          Warteschlange und Hintergrundaufträge
  webhooks/      Ausgehende Ereignisse
  api/           Authentifizierung der Schnittstelle
```

---

## Die Regeln, nach denen gebaut wurde

1. **Mandantenfähig von Anfang an.** Jeder Datensatz trägt eine `tenantId`; der Zugriff läuft
   ausschließlich über `tenantDb(tenantId)` (`src/lib/tenant-db.ts`). Der Scope injiziert und prüft
   die Zuordnung bei jeder Abfrage und weist fremde IDs ab – auch bei direkter Suche.
2. **Mensch entscheidet.** Jede Aktion hat eine Risikostufe. Gering (einordnen, auslesen) läuft
   automatisch, mittel (Auftrag, Terminvorschlag) und hoch (E-Mail senden, Termin buchen) warten
   auf eine Freigabe. Voreinstellung: „Sicher" – Klarwerk schlägt nur vor.
3. **Die AI arbeitet nur über Werkzeuge.** Kein direkter Datenbankzugriff. Der Katalog steht in
   `src/modules/ai/action-catalog.ts`, jedes Werkzeug hat Risikostufe und erforderliche Berechtigung.
   Die AI erbt die Rechte der auslösenden Person und bekommt nie mehr.
4. **Alles nachvollziehbar.** Jede relevante Aktion landet im Protokoll – mit Auslöser, Modell,
   Vertrauenswert, Ergebnis und freigebender Person. Das Audit-Modul kennt kein Ändern und kein Löschen.
5. **Austauschbare Modelle.** `AIProvider` als Schnittstelle, `AnthropicProvider`, `OpenAIProvider`
   und `DemoProvider` als Umsetzungen; die Liste steht in `src/modules/ai/provider-catalog.ts`. Prompts liegen zentral und versioniert (`prompt-catalog.ts` + Datenbank).
6. **Branchen über Konfiguration.** Kategorien, Prioritätsregeln, Zusatzfelder, Statusliste und
   E-Mail-Vorlagen kommen aus dem Branchenprofil. Kein `if (branche === "shk")` im Code.
7. **Keine Geheimnisse im Frontend.** API-Schlüssel und OAuth-Tokens werden verschlüsselt in der
   Datenbank abgelegt und nur serverseitig entschlüsselt.
8. **Fehler sind sichtbar.** Fehlgeschlagene Verarbeitung erscheint an der Nachricht, in der
   Automationsübersicht, als Benachrichtigung und im Protokoll – mit Wiederholmöglichkeit.

---

## Schnittstelle

OpenAPI-Beschreibung: `GET /api/openapi`

| Endpunkt                    | Zweck                                              |
|-----------------------------|----------------------------------------------------|
| `GET  /api/health`          | Systemzustand                                      |
| `POST /api/intake/email`    | Nachricht aus einem Fremdsystem übergeben          |
| `GET  /api/v1/kunden`       | Kunden suchen                                      |
| `POST /api/v1/kunden`       | Kunde anlegen                                      |
| `GET  /api/v1/auftraege`    | Aufträge abrufen                                   |
| `GET  /api/v1/termine`      | Termine oder freie Zeitfenster (`?frei=true`)      |
| `GET  /api/v1/freigaben`    | Offene Freigaben                                   |
| `GET  /api/datenschutz/export` | Vollständiger Datenexport (DSGVO)               |

Authentifizierung über `Authorization: Bearer <API-Schlüssel>` oder die angemeldete Sitzung.
Webhooks (`email.received`, `order.created`, `appointment.changed`, `customer.created`,
`ai.action.completed`, `error.occurred`) werden mit `X-Klarwerk-Signature` (HMAC-SHA256) signiert.

---

## Tests

```bash
npm test
```

71 Tests decken die Bereiche ab, bei denen ein Fehler teuer wäre:

| Datei                        | Prüft                                                            |
|------------------------------|------------------------------------------------------------------|
| `tenant-isolation.test.ts`   | Mandantentrennung bei Lesen, Schreiben, Ändern, Löschen          |
| `rbac.test.ts`               | Rollen und Berechtigungen                                        |
| `ai-tools.test.ts`           | Werkzeugrechte, Risikostufen, Freigabepflicht je Automatisierungsgrad |
| `workflow.test.ts`           | Der vollständige Ablauf aus §41 – von der E-Mail bis zum Protokoll; Einordnung nur einmal je Nachricht |
| `calendar.test.ts`           | Arbeitszeiten, Urlaub, Belegung, Qualifikation, Wunschtermin      |
| `priority.test.ts`           | Branchenregeln eskalieren, aber schwächen nie ab                  |
| `jobs.test.ts`               | Wiederholung, Backoff, Idempotenz, Aufgeben mit Fehlermeldung     |
| `privacy.test.ts`            | Export, Löschung, Aufbewahrungsfristen                            |
| `email.test.ts`              | Kein vorgetäuschter Versand ohne Postfach                         |
| `ai-provider.test.ts`        | Anbieterwahl, Demo-Kennzeichnung, fehlender Zugang, Prompt-Versionierung |
| `anthropic-schema.test.ts`   | Übersetzung der Prompt-Schemas in Anthropics zulässige Teilmenge  |

---

## Weiterführend

- [`docs/architektur.md`](docs/architektur.md) – Aufbau, Datenfluss, Erweiterungspunkte
- [`docs/betrieb.md`](docs/betrieb.md) – Deployment, Hintergrundprozesse, Überwachung
- [`docs/entscheidungen.md`](docs/entscheidungen.md) – warum es so gebaut ist und was noch offen ist

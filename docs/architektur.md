# Architektur

## Der eine Ablauf, um den alles gebaut ist

```
E-Mail trifft ein
   │  (Postfachabruf, Intake-Schnittstelle oder manuelle Erfassung)
   ▼
Automation "Neue Kundenanfrage aufnehmen"        src/modules/workflows/engine.ts
   │
   ├─ 1. Nachricht einordnen                     AI · Risiko gering   → läuft durch
   ├─ 2. Bedingung: neue Anfrage?                                     → sonst Abbruch
   ├─ 3. Angaben auslesen                        AI · Risiko gering   → läuft durch
   │      Adresse, Telefon, Anliegen, Kategorie, Terminwunsch, fehlende Angaben
   │      danach: Prioritätsregeln der Branche (können nur anheben)
   ├─ 4. Kunde suchen                            unscharfer Abgleich  → läuft durch
   ├─ 5. Kunde anlegen (falls unbekannt)         Risiko mittel        → vorgemerkt
   ├─ 6. Auftrag anlegen                         Risiko mittel        → vorgemerkt
   ├─ 7. Kalender prüfen                         Risiko gering        → läuft durch
   ├─ 8. Termin vorschlagen                      Risiko mittel        → vorgemerkt
   ├─ 9. Antwort entwerfen                       Risiko mittel        → vorgemerkt
   │      Versand wird als eigener Schritt mit hohem Risiko angehängt
   └─ 10. Freigabe anfordern                     → ApprovalRequest
   ▼
Mensch entscheidet                                /freigaben
   │  Alles bestätigen · Bearbeiten · einzelne Schritte abwählen · Ablehnen
   ▼
Ausführung mit den Rechten der freigebenden Person  src/modules/approvals/index.ts
   │  Schritte laufen der Reihe nach, Verweise ($ref) werden aufgelöst
   ▼
Auftrag · Termin · Antwortentwurf · Protokolleinträge
```

Ob ein Schritt sofort läuft oder wartet, entscheidet allein die Freigabepolitik des Betriebs –
nicht der Code des Schrittes. `stageOrExecute()` fragt `executeAction(..., "auto")`; das Werkzeug
meldet „vorgemerkt" zurück, statt zu handeln.

## Schichten

```
Oberfläche (Server Components, Server Actions)
   │  kennt nur Module, nie Prisma direkt
   ▼
Module (src/modules/*)
   │  fachliche Regeln, klare Schnittstellen untereinander
   ▼
tenantDb(tenantId)  ← Mandantenschranke
   ▼
Prisma / PostgreSQL
```

**Die Mandantenschranke** (`src/lib/tenant-db.ts`) ist ein Proxy über den Prisma-Delegates. Er

- ergänzt `tenantId` in jeder `where`-Bedingung,
- prüft `create`/`update`/`upsert`-Daten auf abweichende Mandanten,
- prüft bei `findUnique` das geladene Ergebnis nach,
- wirft `TenantIsolationError`, sobald eine fremde `tenantId` auftaucht.

Direkter `prisma`-Zugriff bleibt für Seed, Worker-Bootstrap und mandantenübergreifende
Plattformabfragen möglich – sichtbar an `prisma.` statt `db.` im Code.

## AI-Schicht

```
runAITask({ tenantId, promptKey, variables, context })
   │
   ├─ resolveProvider(tenantId)     Tenant-Konfiguration → Umgebung → Demo
   ├─ Prompt aus der Datenbank      versioniert; Fallback auf den Katalog im Code
   ├─ provider.complete(...)        OpenAIProvider | DemoProvider
   └─ AIExecution + UsageRecord     Modell, Dauer, Token, Kosten, Vertrauenswert, isDemo
```

Werkzeuge (`src/modules/ai/tools.ts`) sind die einzige Möglichkeit für die AI, etwas zu verändern:

```
executeAction(key, args, context, mode)
   ├─ Werkzeug im Katalog? aktiviert für den Betrieb?
   ├─ hat die auslösende Person die nötige Berechtigung?
   ├─ mode "auto" + Freigabe nötig? → nur vormerken
   ├─ Handler ausführen (über tenantDb)
   └─ Protokolleintrag – bei Erfolg wie bei Fehler
```

## Branchen als Daten

`src/modules/industry/profiles.ts` beschreibt je Gewerk: Auftragskategorien mit Signalwörtern,
Regeldauer und Qualifikation, Prioritätsregeln, Zusatzfelder, E-Mail-Kategorien, Statusliste,
Textvorlagen und ergänzende AI-Anweisungen. Beim Anlegen eines Betriebs wird das Profil in die
Datenbank kopiert (`IndustryProfile`) und dort weiter angepasst. Ein neues Gewerk ist ein neuer
Eintrag in dieser Liste – keine Codeänderung an Engine, Werkzeugen oder Oberfläche.

## Erweiterungspunkte

| Vorhaben                     | Ansatzpunkt                                                     |
|------------------------------|-----------------------------------------------------------------|
| Weiteres AI-Modell           | `AIProvider` umsetzen, in `resolveProvider` eintragen           |
| Weitere Branche              | Eintrag in `INDUSTRY_PROFILES`                                  |
| Weitere Integration          | `EmailProvider` bzw. eigenes Modul, `Integration`-Datensatz     |
| Neues Werkzeug für die AI    | Eintrag in `AI_ACTIONS` + Handler in `tools.ts`                 |
| Neuer Automationsschritt     | Handler in `STEP_HANDLERS`, Schritt als Datensatz               |
| Visueller Workflow-Editor    | `WorkflowStep` ist bereits Daten – Oberfläche darüber legen     |
| WhatsApp, Telefon, Formular  | `POST /api/intake/email` bedienen                               |
| Kundenportal, Techniker-App  | `/api/v1` erweitern; Rechte über `ApiKey.scopes`                |

## Was bewusst offen ist

- **Kalendersynchronisation** mit Outlook/Google: Termine entstehen in Klarwerk; das Zurückschreiben
  ist vorbereitet (Tokens mit Kalenderberechtigung), aber nicht umgesetzt.
- **Bilder und gescannte PDFs** werden gespeichert, aber nicht ausgelesen – das steht so an der Datei.
- **Stripe** ist im Datenmodell vorbereitet (Tarif, Zeitraum, Limits, Verbrauch); die Zahlungsabwicklung fehlt.
- **Redis** wird für Warteschlange und Ratenbegrenzung nicht benötigt; beide arbeiten datenbank- bzw.
  prozesslokal. Der Vertrag ist so geschnitten, dass ein Redis-Backend später eintreten kann.

# MASTER-PROMPT: KI-BACKOFFICE-SAAS FÜR HANDWERKSBETRIEBE

## 1. PRODUKT-VISION

Entwickle eine moderne, skalierbare SaaS-Webanwendung für kleine und mittelständische Handwerksbetriebe.

Arbeitstitel des Produkts: **Klarwerk**.

Positionierung:

> Klarwerk ist ein digitaler Mitarbeiter für Handwerksbetriebe. Klarwerk liest eingehende Anfragen, versteht deren Inhalt, extrahiert relevante Informationen, erstellt Aufträge, schlägt Termine vor, bereitet Antworten vor und automatisiert wiederkehrende Büroarbeit.

Das Produkt soll zunächst auf Handwerksbetriebe ausgerichtet sein, insbesondere:

- SHK
- Elektro
- Sanitär
- Heizung
- Klima
- Dachdecker
- Maler
- Schreiner/Tischler
- Fensterbauer
- Gebäudereinigung
- Hausmeisterdienste
- weitere lokale Dienstleistungsbetriebe

Die Architektur muss von Anfang an so konzipiert sein, dass später weitere Branchen unterstützt werden können.

WICHTIG:

Das Produkt darf NICHT hart auf SHK oder eine einzelne Branche programmiert werden.

Branchenunterschiede sollen über Konfigurationen, Templates, Workflows, Felder und Regeln abbildbar sein.

---

# 2. HAUPTZIEL

Der Benutzer soll möglichst wenig manuelle Büroarbeit leisten müssen.

Beispiel:

Ein Kunde schickt:

"Hallo, unsere Heizung funktioniert seit gestern nicht mehr. Wir wohnen in der Musterstraße 15. Können Sie jemanden vorbeischicken?"

Klarwerk soll daraus automatisch erkennen:

- Kunde
- Telefonnummer
- E-Mail
- Adresse
- Problem
- Kategorie
- Priorität
- gewünschter Termin
- mögliche Dringlichkeit
- fehlende Informationen

Danach soll Klarwerk:

1. bestehenden Kunden suchen
2. ggf. neuen Kunden vorschlagen
3. Auftrag erstellen
4. Priorität bestimmen
5. Kalender nach passenden Terminen durchsuchen
6. einen Terminvorschlag erstellen
7. eine Antwort vorbereiten
8. den Mitarbeiter um Freigabe bitten

Später sollen Workflows optional vollständig automatisiert werden können.

---

# 3. WICHTIGE PRODUKTPHILOSOPHIE

Die Anwendung soll nicht primär als "AI-Chatbot" erscheinen.

Sie soll als **digitaler Mitarbeiter / Backoffice-Assistent** positioniert werden.

Der Benutzer soll nicht mit Prompts arbeiten müssen.

Der Benutzer soll nicht verstehen müssen, welches LLM verwendet wird.

Der Benutzer soll möglichst natürliche Aufgaben erledigen können:

- "Zeig mir alle offenen Kundenanfragen."
- "Welche Termine sind morgen frei?"
- "Welche Angebote wurden noch nicht beantwortet?"
- "Bereite eine Antwort für Herrn Müller vor."
- "Welche Aufträge sind dringend?"

---

# 4. TECHNISCHE ARCHITEKTUR

Baue eine moderne Full-Stack-Webanwendung.

Bevorzugter Stack:

Frontend:
- Next.js
- React
- TypeScript
- Tailwind CSS
- moderne UI-Komponenten

Backend:
- TypeScript / Node.js
- API-first Architektur

Datenbank:
- PostgreSQL

ORM:
- Prisma oder Drizzle

Authentication:
- sichere Authentifizierung
- E-Mail/Passwort
- optional OAuth
- später Microsoft/Google Login

AI:
- OpenAI API als primärer Provider
- Architektur so gestalten, dass später andere Modelle integriert werden können

Email:
- Microsoft Graph API
- Gmail API
- IMAP/SMTP als Fallback, sofern sinnvoll

Deployment:
- Docker
- cloud-ready
- zunächst einfach deploybar
- später horizontal skalierbar

Dateispeicher:
- S3-kompatibler Storage

Caching/Queues:
- Redis
- Background Jobs

---

# 5. MULTI-TENANCY

Das System muss von Anfang an mandantenfähig sein.

Ein Unternehmen = Tenant.

Ein Tenant besitzt:

- Benutzer
- Kunden
- Aufträge
- E-Mails
- Termine
- Dokumente
- Workflows
- Einstellungen
- AI-Konfiguration
- Integrationen

Daten verschiedener Unternehmen dürfen NIEMALS vermischt werden.

Jeder relevante Datenbankdatensatz muss tenant_id besitzen oder anderweitig eindeutig einem Tenant zugeordnet sein.

Implementiere konsequente Tenant-Isolation.

---

# 6. BENUTZERROLLEN

Mindestens:

## Owner

Darf alles.

## Admin

Darf:

- Benutzer verwalten
- Integrationen verwalten
- Workflows verwalten
- Einstellungen verändern

## Office Manager

Darf:

- Kunden
- Aufträge
- E-Mails
- Termine
- AI-Vorschläge

bearbeiten.

## Mitarbeiter

Eingeschränkter Zugriff.

## Techniker

Soll primär relevante Aufträge und Termine sehen.

Später erweiterbar.

---

# 7. ONBOARDING

Beim ersten Login:

Schritt 1:

"Willkommen bei Klarwerk."

Schritt 2:

Unternehmen anlegen:

- Firmenname
- Branche
- Adresse
- Telefonnummer
- E-Mail
- Website
- Anzahl Mitarbeiter

Schritt 3:

Branche auswählen.

Beispiel:

- SHK
- Elektro
- Dachdecker
- Maler
- Gebäudereinigung
- Sonstiges

Schritt 4:

Arbeitszeiten definieren.

Schritt 5:

E-Mail verbinden.

Optionen:

- Microsoft 365
- Google Workspace
- später IMAP

Schritt 6:

Kalender verbinden.

Schritt 7:

optional bestehendes CRM/ERP verbinden.

Schritt 8:

AI-Automatisierungsgrad auswählen:

### Sicher

AI macht nur Vorschläge.

### Assistiert

AI führt bestimmte Aktionen nach Freigabe aus.

### Automatisch

AI darf definierte Aktionen selbstständig durchführen.

Standardmäßig immer "Sicher".

---

# 8. DASHBOARD

Das Dashboard soll nicht technisch wirken.

Oben:

"Hallo, Max 👋"

Darunter:

## Heute

- 7 neue Anfragen
- 3 offene Angebote
- 12 Termine
- 2 dringende Fälle
- 4 Aufgaben von Klarwerk

---

## AI-Aktivitäten

Beispiel:

"Neue Kundenanfrage erkannt."

"Auftrag vorbereitet."

"Terminvorschlag erstellt."

"Antwortentwurf erstellt."

---

## Freigaben

Alle Aktionen, die menschliche Bestätigung benötigen.

Beispiel:

### Neue Anfrage

Max Mustermann

"Heizung funktioniert nicht."

Klarwerk schlägt vor:

- Auftrag erstellen
- Priorität: Hoch
- Termin: Dienstag 10:30
- Antwort senden

Buttons:

[Alles bestätigen]

[Bearbeiten]

[Ablehnen]

---

# 9. E-MAIL-INBOX

Zentrale Ansicht:

- Posteingang
- Bearbeitet
- Wartet auf Freigabe
- Automatisch verarbeitet
- Fehler

Jede E-Mail soll klassifiziert werden.

Mögliche Kategorien:

- neue Anfrage
- bestehender Auftrag
- Termin
- Angebot
- Rechnung
- Reklamation
- allgemeine Frage
- Spam
- sonstiges

Die Kategorien müssen konfigurierbar sein.

---

# 10. AI-DOKUMENTENVERARBEITUNG

Unterstütze:

- PDF
- Bilder
- Word
- Excel
- E-Mail-Anhänge

AI soll relevante Informationen extrahieren.

Beispiel:

{
  customerName,
  email,
  phone,
  address,
  issue,
  urgency,
  category,
  requestedDate,
  requestedTime,
  attachments,
  confidence
}

Wichtig:

Jede AI-extrahierte Information soll eine Confidence / Vertrauensbewertung besitzen.

Niedrige Confidence soll eine manuelle Prüfung auslösen.

---

# 11. KUNDENVERWALTUNG

Kundenprofil:

- Name
- Firma
- Adresse
- Telefonnummer
- E-Mail
- Kundennummer
- Notizen
- Aufträge
- Termine
- Angebote
- Rechnungen
- Kommunikation
- Dokumente

AI soll erkennen können, ob eine eingehende Anfrage zu einem bestehenden Kunden gehört.

Fuzzy Matching verwenden.

Bei Unsicherheit:

"Meinst du Max Mustermann?"

---

# 12. AUFTRAGSVERWALTUNG

Auftrag:

- Auftragsnummer
- Kunde
- Beschreibung
- Kategorie
- Priorität
- Status
- Mitarbeiter
- Techniker
- Termin
- Notizen
- Anhänge
- AI-Zusammenfassung
- Erstellungsdatum

Status:

- Neu
- Prüfung
- Angebot erforderlich
- Geplant
- In Bearbeitung
- Erledigt
- Storniert

Status muss konfigurierbar sein.

---

# 13. KALENDER

Kalenderansicht:

- Tag
- Woche
- Monat

Techniker als Ressourcen darstellen.

Beispiel:

Montag:

08:00 Techniker A
10:30 Techniker B
13:00 Techniker A

AI soll passende Termine finden können.

Berücksichtige:

- Arbeitszeiten
- Urlaub
- bereits belegte Termine
- Dauer
- Technikerqualifikation
- Region
- Priorität
- Fahrtzeit, falls verfügbar

---

# 14. AI-TERMINPLANUNG

Wenn eine Anfrage kommt:

"Bitte möglichst Donnerstag Nachmittag."

AI soll:

1. Kalender prüfen
2. passende Mitarbeiter finden
3. freie Zeiträume ermitteln
4. passende Termine priorisieren
5. Terminvorschlag erzeugen

Beispiel:

"Klarwerk empfiehlt Donnerstag 14:30 bei Techniker Stefan."

---

# 15. E-MAIL-ANTWORTEN

AI erstellt Antwortentwürfe.

Beispiel:

"Hallo Herr Mustermann,

vielen Dank für Ihre Anfrage.

Wir können Ihnen Donnerstag um 14:30 Uhr einen Termin anbieten.

Viele Grüße
Muster GmbH"

Mitarbeiter kann:

- senden
- bearbeiten
- neu generieren
- verwerfen

Ton konfigurieren:

- professionell
- freundlich
- kurz
- locker

Unternehmenssprache soll konfigurierbar sein.

---

# 16. AI-AUTOMATION ENGINE

Baue ein generisches Workflow-System.

Beispiel:

TRIGGER:

Neue E-Mail

↓

CONDITION:

Kategorie = neue Anfrage

↓

ACTION:

Kunde suchen

↓

ACTION:

Auftrag erstellen

↓

ACTION:

Priorität bestimmen

↓

ACTION:

Kalender prüfen

↓

ACTION:

Antwort erstellen

↓

ACTION:

Freigabe verlangen

Dieses System muss später visuell konfigurierbar sein.

---

# 17. HUMAN-IN-THE-LOOP

Jede Aktion muss eine Berechtigungsstufe besitzen.

Beispiel:

### Niedriges Risiko

- E-Mail klassifizieren
- Daten extrahieren
- Zusammenfassung erstellen

→ automatisch

### Mittleres Risiko

- Auftrag erstellen
- Termin vorschlagen

→ standardmäßig Freigabe

### Hohes Risiko

- E-Mail senden
- Termin verbindlich buchen
- Rechnung erstellen
- Daten löschen

→ explizite Freigabe

Diese Regeln müssen konfigurierbar sein.

---

# 18. AI-AKTIONEN

AI darf niemals direkt beliebige Datenbankoperationen ausführen.

Stattdessen muss AI über definierte Tools/Functions arbeiten.

Beispiele:

search_customer()

create_customer()

update_customer()

create_order()

update_order()

search_calendar()

create_appointment()

draft_email()

send_email()

search_documents()

create_task()

Die AI bekommt nur Zugriff auf Tools, für die der aktuelle Benutzer/Tenant berechtigt ist.

---

# 19. AUDIT LOG

Jede relevante AI-Aktion protokollieren.

Beispiel:

Zeit:
04.09.2026 14:32

Aktion:
Auftrag erstellt

Auslöser:
E-Mail von Max Mustermann

AI:
GPT-Modell

Aktion:
create_order

Ergebnis:
Erfolgreich

Freigabe:
Max Mustermann

Audit Logs dürfen nicht einfach gelöscht werden.

---

# 20. AI-MODELL-ABSTRAKTION

AI nicht direkt überall im Code aufrufen.

Erstelle eine zentrale AI-Service-Schicht:

AIProvider

↓

OpenAIProvider

↓

später:

AnthropicProvider

GoogleProvider

LocalModelProvider

Dadurch kann später je nach Aufgabe automatisch das passende Modell verwendet werden.

---

# 21. PROMPT MANAGEMENT

Prompts nicht hart in einzelnen Komponenten speichern.

Zentrales Prompt-System.

Beispiele:

email_classifier_v1

customer_extractor_v1

order_extractor_v1

email_reply_v1

appointment_reasoner_v1

Prompts versionieren.

Speichere:

- Version
- Datum
- Modell
- Ergebnisqualität
- Fehler

---

# 22. BRANCHEN-ADAPTIERBARKEIT

Das System muss ein Branchenprofil besitzen.

Beispiel:

IndustryProfile:

{
  industry: "plumbing",
  terminology: [...],
  orderCategories: [...],
  priorityRules: [...],
  fields: [...],
  workflows: [...],
  emailTemplates: [...],
  aiInstructions: [...]
}

Für Elektro könnten andere Felder existieren.

Für Dachdecker andere.

Für Gebäudereinigung wieder andere.

Kein harter Code pro Branche.

---

# 23. CUSTOM FIELDS

Unternehmen müssen eigene Felder definieren können.

Beispiel SHK:

- Heizungsart
- Hersteller
- Baujahr
- Fehlercode

Elektro:

- Sicherungskasten
- Anlage
- Spannung
- Fehlercode

Das System muss Custom Fields unterstützen.

---

# 24. INTEGRATIONEN

Architektur für Integrationen:

IntegrationProvider

Unterstütze zunächst:

- Microsoft 365
- Google Workspace
- Microsoft Outlook
- Google Calendar

Später:

- DATEV
- verschiedene Handwerkersoftware
- CRM
- ERP
- WhatsApp Business
- Telefonanlagen

Jede Integration muss isoliert und austauschbar sein.

---

# 25. API

Baue eine saubere REST- oder GraphQL-API.

Alle zentralen Funktionen müssen über API verfügbar sein.

Dokumentation mit OpenAPI.

---

# 26. WEBHOOKS

Unterstütze Webhooks für:

- neue E-Mail
- neuer Auftrag
- Termin geändert
- Kunde erstellt
- AI-Aktion abgeschlossen
- Fehler

---

# 27. BENACHRICHTIGUNGEN

Unterstütze:

- In-App
- E-Mail

Später:

- SMS
- Push
- WhatsApp

Beispiele:

"Klarwerk benötigt deine Freigabe."

"Dringende Kundenanfrage."

"AI konnte Anfrage nicht eindeutig klassifizieren."

---

# 28. FEHLERBEHANDLUNG

AI darf niemals still scheitern.

Wenn eine Integration nicht funktioniert:

Status:

"Aktion konnte nicht ausgeführt werden."

Mit:

- Fehlerbeschreibung
- Retry
- manuelle Bearbeitung

Background Jobs müssen:

- retryfähig
- idempotent
- nachvollziehbar

sein.

---

# 29. SECURITY

Sehr wichtig.

Implementiere:

- HTTPS
- sichere Authentifizierung
- Passwort-Hashing
- Session-Sicherheit
- RBAC
- Tenant Isolation
- verschlüsselte Secrets
- sichere API Keys
- Rate Limiting
- CSRF/XSS-Schutz
- Input Validation
- SQL Injection Protection
- sichere File Uploads

Keine Secrets im Frontend.

Keine API Keys im Browser.

---

# 30. DATENSCHUTZ / DSGVO

Produkt primär für EU/Deutschland konzipieren.

Implementiere:

- Datenexport
- Datenlöschung
- Benutzerlöschung
- Audit Logs
- Consent Management, wo erforderlich
- Datenaufbewahrungsregeln
- Privacy Settings

Architektur muss später EU-Hosting ermöglichen.

Keine Kundendaten unnötig speichern.

AI-Anfragen so gestalten, dass nur notwendige Informationen an externe AI-Provider übertragen werden.

Keine Kundendaten für Modelltraining verwenden.

Konfigurierbare AI-Provider.

---

# 31. AI-DATENSCHUTZ

Zeige im Adminbereich:

"Welche Daten werden an welchen AI-Provider übertragen?"

Beispiel:

OpenAI:
- E-Mail-Inhalt
- relevante Kundendaten
- keine Zahlungsdaten

Der Tenant soll AI-Provider konfigurieren können.

---

# 32. AI-CONFIDENCE

Jede wichtige AI-Aktion soll eine Confidence besitzen.

Beispiel:

Kundenzuordnung:
98 %

Kategorie:
94 %

Priorität:
72 %

Wenn unter Schwellenwert:

→ manuelle Prüfung.

Schwellenwerte sollen konfigurierbar sein.

---

# 33. AI-EVALUATION

Baue ein internes Evaluation-System.

Speichere anonymisierte/geeignete Testfälle.

Beispiel:

Input:
"Heizung komplett ausgefallen."

Expected:
category = heating_failure

AI result:
category = heating_failure

Pass.

Damit können Prompt-/Modelländerungen getestet werden.

---

# 34. ANALYTICS

Dashboard für Unternehmer:

- Anzahl Anfragen
- automatisch verarbeitet
- manuell bearbeitet
- durchschnittliche Bearbeitungszeit
- eingesparte Zeit
- AI-Fehlerrate
- Freigaberate
- offene Aufträge
- offene Angebote
- Conversion Rate

Besonders wichtig:

## "Zeit gespart"

Beispiel:

"Diese Woche hat Klarwerk schätzungsweise 14,5 Stunden Büroarbeit übernommen."

---

# 35. BILLING

SaaS-Modell vorbereiten.

Subscription pro Unternehmen.

Beispiel:

Starter
299 €/Monat

Business
699 €/Monat

Pro
1.499 €/Monat

Preise und Limits müssen konfigurierbar sein.

Abrechnung vorbereiten für Stripe.

Usage Tracking:

- AI-Aufrufe
- verarbeitete E-Mails
- Dokumente
- Automationen
- Benutzer

---

# 36. ADMIN PANEL

Plattform-Admin kann:

- Tenants sehen
- Benutzer sehen
- Subscription sehen
- Usage sehen
- Fehler sehen
- AI-Kosten sehen
- Systemmetriken sehen

ABER:

Admin darf standardmäßig keine vertraulichen Kundendaten einsehen.

Für Support-Zugriff:

- explizite Berechtigung
- Audit Log
- zeitlich begrenzter Zugriff

---

# 37. UI / UX

Design:

- modern
- hochwertig
- minimalistisch
- seriös
- B2B
- nicht "AI-Spielzeug"

Primärnavigation:

Dashboard
E-Mails
Kunden
Aufträge
Kalender
Dokumente
Automationen
AI
Analytics
Einstellungen

Mobile responsive.

Besonders wichtig:

Das Produkt muss für Menschen funktionieren, die keine Technikexperten sind.

Keine unnötigen technischen Begriffe.

Nicht "LLM".

Sondern:

"AI-Assistent".

Nicht "Token Usage".

Sondern:

"AI-Verbrauch".

---

# 38. AI-CHAT

Optionales Interface:

Der Benutzer kann Klarwerk fragen:

"Welche Aufträge sind diese Woche noch offen?"

"Welche Kunden warten seit mehr als drei Tagen auf eine Antwort?"

"Zeig mir alle dringenden Anfragen."

"Bereite eine Antwort für Müller vor."

Die AI darf nur Daten aus dem aktuellen Tenant verwenden.

Alle Aktionen müssen über Tools erfolgen.

---

# 39. DATENMODELL

Erstelle mindestens folgende Entities:

Tenant
User
Role
Customer
CustomerContact
Order
OrderStatus
Appointment
Employee
Email
EmailAttachment
Document
Task
Workflow
WorkflowStep
AIAction
AIExecution
AIProvider
Integration
AuditLog
Notification
Subscription
UsageRecord
IndustryProfile
CustomField
CustomFieldValue
PromptTemplate
PromptVersion

Datenbank sauber normalisieren.

---

# 40. SEED DATA

Erstelle Demo-Daten für einen fiktiven SHK-Betrieb:

"Muster Heizungs- & Sanitär GmbH"

Mit:

- 20 Kunden
- 10 offenen Aufträgen
- 10 E-Mails
- 5 Mitarbeitern
- 10 Terminen
- verschiedenen AI-Vorschlägen

Damit soll die Anwendung sofort demonstrierbar sein.

---

# 41. DEMO WORKFLOW

Implementiere einen vollständigen End-to-End-Demo-Workflow.

Input:

Neue E-Mail:

"Hallo, unsere Heizung funktioniert seit gestern nicht mehr. Wir wohnen in der Hauptstraße 15 und brauchen möglichst schnell Hilfe."

System:

1. E-Mail empfangen
2. AI analysiert E-Mail
3. Kunde suchen
4. Problem erkennen
5. Priorität bestimmen
6. Auftrag vorbereiten
7. Kalender prüfen
8. Termin vorschlagen
9. Antwort erstellen
10. Benutzer zeigt Freigabe
11. Benutzer bestätigt
12. Auftrag speichern
13. Termin speichern
14. E-Mail senden
15. Audit Log schreiben

Dieser Workflow muss vollständig funktionieren.

---

# 42. WICHTIG: KEINE FAKE-AI

Wenn eine echte AI API nicht konfiguriert ist:

Zeige klar:

"AI provider not configured."

Erstelle niemals scheinbar echte AI-Ergebnisse, die als echt dargestellt werden.

Für Demo-Modus darf ein Mock Provider verwendet werden, dieser muss aber klar als Demo gekennzeichnet sein.

---

# 43. DEVELOPMENT MODE

Um Entwicklung zu vereinfachen:

.env.example erstellen.

Beispiel:

DATABASE_URL=
OPENAI_API_KEY=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
STRIPE_SECRET_KEY=
S3_ENDPOINT=

Keine Secrets committen.

---

# 44. TESTING

Implementiere:

Unit Tests
Integration Tests
API Tests
Workflow Tests

Besonders testen:

- Tenant Isolation
- Berechtigungen
- AI Tool Permissions
- E-Mail Verarbeitung
- Kalender
- Workflow Engine
- Retry-Verhalten
- Datenlöschung

---

# 45. OBSERVABILITY

Implementiere:

- structured logging
- error tracking
- metrics
- job monitoring

AI-spezifische Metriken:

- AI request count
- latency
- cost
- failure rate
- confidence
- human override rate

---

# 46. ARCHITEKTURPRINZIP

Vermeide einen riesigen Monolithen.

Module:

/auth
/tenants
/users
/customers
/orders
/calendar
/email
/documents
/workflows
/ai
/integrations
/billing
/analytics
/notifications

Klare Interfaces zwischen Modulen.

---

# 47. EXTENSIBILITY

Das Produkt muss später folgende Funktionen ermöglichen:

- Telefon-AI
- WhatsApp
- automatische Angebotsgenerierung
- automatische Rechnungsprüfung
- Zahlungserinnerungen
- Dokumentenmanagement
- Routenplanung
- Techniker-App
- Kundenportal
- Voice Assistant
- mobile App
- weitere Branchen
- weitere AI Provider

Architektur nicht so bauen, dass diese Erweiterungen später einen Rewrite erfordern.

---

# 48. PRODUKTSTRATEGIE

MVP zuerst.

Nicht sofort alle Funktionen bauen.

Priorität:

### Phase 1

- Authentication
- Tenant
- Benutzer
- Onboarding
- E-Mail Integration
- AI E-Mail Analyse
- Kunden
- Aufträge
- AI Vorschläge
- Human Approval
- Antwortentwürfe
- Audit Log

### Phase 2

- Kalender
- automatische Terminfindung
- Workflows
- Analytics
- weitere Integrationen

### Phase 3

- Telefon
- WhatsApp
- Angebote
- Rechnungen
- Branchenprofile
- Marketplace/Integrationen

---

# 49. MVP-ERFOLGSKRITERIUM

Der MVP ist erfolgreich, wenn ein echter Handwerksbetrieb folgende Situation hat:

Eine Kundenanfrage kommt per E-Mail.

Klarwerk verarbeitet sie automatisch.

Der Mitarbeiter sieht innerhalb weniger Sekunden:

- Wer?
- Was?
- Wo?
- Wie dringend?
- Was soll passieren?
- Antwortentwurf
- Terminvorschlag

Der Mitarbeiter muss idealerweise nur:

**"Bestätigen"**

drücken.

---

# 50. PRODUKTREGEL

Die wichtigste Produktregel lautet:

> Jede Funktion muss Büroarbeit reduzieren.

Keine Funktion nur hinzufügen, weil sie technisch interessant ist.

Frage bei jeder Funktion:

"Spart diese Funktion dem Benutzer Zeit?"

Wenn nein:

nicht priorisieren.

---

# 51. NICHT VERHANDELBARE REGELN

1. Multi-Tenant von Anfang an.
2. DSGVO/EU als Designziel.
3. Human-in-the-loop standardmäßig.
4. AI darf nur über kontrollierte Tools Aktionen ausführen.
5. Audit Logs für relevante Aktionen.
6. AI Provider austauschbar.
7. Branchen über Konfiguration statt Hardcoding.
8. Integrationen modular.
9. Keine Secrets im Frontend.
10. Keine Kundendaten für AI-Training verwenden.
11. Keine Fake-Automatisierung.
12. Fehler müssen sichtbar sein.
13. Jede kritische Aktion muss rückverfolgbar sein.
14. MVP zuerst, keine unnötige Komplexität.
15. UX für nicht-technische Benutzer optimieren.

---

# 52. ENTWICKLUNGSVORGEHEN

Arbeite nicht sofort an allen Features gleichzeitig.

Gehe iterativ vor.

SCHRITT 1:
Architektur und Datenmodell erstellen.

SCHRITT 2:
Authentication + Tenant System.

SCHRITT 3:
Onboarding.

SCHRITT 4:
Kunden + Aufträge.

SCHRITT 5:
E-Mail Integration.

SCHRITT 6:
AI Extraction.

SCHRITT 7:
Human Approval.

SCHRITT 8:
AI Reply Generation.

SCHRITT 9:
Audit Logs.

SCHRITT 10:
Demo Workflow.

Erst wenn dieser End-to-End-Workflow funktioniert, weitere Features hinzufügen.

---

# 53. DEIN ERSTES ZIEL

Baue keinen "vollständigen ERP-Ersatz".

Baue:

> **Den besten AI-Assistenten für eingehende Kundenanfragen in kleinen Handwerksbetrieben.**

Der Benutzer soll nach Installation innerhalb von 15 Minuten eine E-Mail verbinden und eine erste echte Anfrage durch Klarwerk verarbeiten können.

Der MVP soll sich so anfühlen:

**E-Mail kommt rein → Klarwerk versteht sie → Klarwerk bereitet alles vor → Mitarbeiter bestätigt.**

Das ist das Kernprodukt.

Alles andere kommt danach.
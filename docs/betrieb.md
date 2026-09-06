# Betrieb

## Umgebungsvariablen

Alle in `.env.example` beschrieben. Zwingend erforderlich:

| Variable         | Zweck                                                        |
|------------------|--------------------------------------------------------------|
| `DATABASE_URL`   | PostgreSQL                                                   |
| `ENCRYPTION_KEY` | Verschlüsselung gespeicherter Secrets (AES-256-GCM)          |
| `SESSION_SECRET` | Signatur der Sitzungs-Token                                  |
| `APP_URL`        | Öffentliche Adresse, wird für OAuth-Rückläufe gebraucht      |

Schlüssel erzeugen: `openssl rand -base64 48`.
**`ENCRYPTION_KEY` niemals wechseln, ohne bestehende Secrets neu zu hinterlegen** – gespeicherte
API-Schlüssel und OAuth-Tokens sind sonst nicht mehr lesbar.

Ohne `OPENAI_API_KEY` läuft der gekennzeichnete Demo-Modus. Ohne `S3_*` wird lokal unter `./storage`
gespeichert. Ohne Microsoft-/Google-Zugangsdaten werden die entsprechenden Anbindungen in der
Oberfläche als „nicht konfiguriert" ausgewiesen statt angeboten.

## Start

```bash
docker compose up -d postgres redis     # Datenbank
npm run db:push                          # oder: npx prisma migrate deploy
npm run build && npm start               # Anwendung
npm run worker                           # Hintergrundprozess (eigener Prozess)
```

Vollständig containerisiert:

```bash
docker compose --profile full up --build
```

## Hintergrundprozess

`npm run worker` erledigt:

- **Postfachabruf** alle fünf Minuten je verbundenem Konto (`WORKER_MAILBOX_MS`).
  Für jede neue Nachricht wird das Webhook-Ereignis gesendet und die Automation gestartet.
- **Aufbewahrungsfristen** einmal täglich für alle Betriebe.
- **Warteschlange**: bis zu zehn Aufträge je Durchlauf (`WORKER_POLL_MS`, Standard 5 s).

Aufträge sind idempotent (`idempotencyKey`), werden bis zu fünfmal mit wachsendem Abstand
wiederholt (2, 4, 8, 16, 32 Minuten) und landen danach als `DEAD` mit Fehlertext im
Plattform-Adminbereich. Mehrere Worker sind unproblematisch: der Zugriff wird über einen
Statuswechsel gesichert, nur einer bekommt den Auftrag.

## Überwachung

- `GET /api/health` – Datenbank, AI-Zustand, Speicher. Antwortet mit 503, wenn die Datenbank fehlt.
- **Strukturierte Logs** als JSON auf stdout, mit `module`, `tenantId` und Fehlertext.
- **AI-Kennzahlen** in `AIExecution`: Modell, Dauer, Token, Kosten, Vertrauenswert, Demo-Kennzeichen,
  Fehler. Ausgewertet unter *Auswertung* und im Plattform-Adminbereich.
- **Übersteuerungsquote**: abgelehnte Freigaben im Verhältnis zu entschiedenen – der beste Frühindikator
  für nachlassende Qualität von Prompt oder Modell.

## Plattform-Administration

Erreichbar unter `/admin` für Benutzer mit `isPlatformAdmin` oder einer Adresse aus
`PLATFORM_ADMIN_EMAILS`. Die Ansicht zeigt Betriebe, Verbrauch, AI-Kosten, Fehler und
Systemzustand – **keine Inhalte aus Postfächern oder Kundenakten**. Support-Einblick verlangt einen
befristeten `SupportAccessGrant` und wird protokolliert.

## Sicherung und Wiederherstellung

Zu sichern sind die PostgreSQL-Datenbank und – bei lokalem Speicher – das Verzeichnis `./storage`.

```bash
docker exec klarwerk-postgres pg_dump -U klarwerk klarwerk > klarwerk-$(date +%F).sql
```

Der Datenexport je Betrieb (`/api/datenschutz/export`) ersetzt keine Sicherung: er enthält
Fachdaten, aber keine Dateiinhalte und keine Zugangsdaten.

## Vor dem Produktivbetrieb

- [ ] `ENCRYPTION_KEY` und `SESSION_SECRET` aus einem Geheimnisspeicher, nicht aus der Datei
- [ ] HTTPS erzwingen (Reverse Proxy); Cookies werden dann automatisch als `secure` gesetzt
- [ ] `prisma migrate deploy` statt `db:push`
- [ ] Datenbank in der EU betreiben, AI-Anbieter mit EU-Verarbeitung wählen
- [ ] Auftragsverarbeitungsvertrag mit dem AI-Anbieter, Trainingsnutzung ausschließen
- [ ] Sicherung einrichten und Wiederherstellung einmal geprobt
- [ ] Worker als eigenen, überwachten Dienst betreiben

# Entscheidungen

Kurze Begründungen zu den Punkten, an denen es mehrere vertretbare Wege gab.

## Freigaben als eigene Einheit statt als Kennzeichen am Auftrag

Eine Anfrage erzeugt selten genau eine Aktion. Typisch sind vier: Kunde anlegen, Auftrag anlegen,
Termin vorschlagen, Antwort entwerfen – teils voneinander abhängig. Eine `ApprovalRequest` fasst
diese Kette zusammen, hält sie in einer Reihenfolge und erlaubt es, einzelne Schritte abzuwählen.
Verweise zwischen Schritten (`"$ref:order.id"`) werden erst bei der Ausführung aufgelöst, weil die
IDs vorher nicht existieren.

Die Alternative – jede Aktion einzeln freigeben – hätte den Kern des Produkts zerstört: den einen
Knopf.

## Die AI erbt Rechte, sie hat keine eigenen

Werkzeuge werden mit den Berechtigungen der auslösenden Person geprüft. Ein Techniker, der eine
Frage stellt, bekommt keine Werkzeuge angeboten, die er selbst nicht ausführen dürfte. Bei der
Ausführung einer Freigabe zählen die Rechte der freigebenden Person, nicht die des Systems.

Automationen im Hintergrund haben keine auslösende Person. Sie laufen mit den Rechten der
Inhaberrolle des Betriebs – aber ausschließlich, um Vorschläge vorzubereiten. Alles mit Risiko
wartet bis zu einer echten Freigabe durch einen Menschen.

## Branchenregeln dürfen die Priorität nur anheben

`determinePriority()` nimmt den Vorschlag des Modells entgegen und vergleicht ihn mit den Regeln des
Branchenprofils. Das Ergebnis ist immer das Maximum. Ein Modell, das „Gasgeruch" für normal hält,
kann eine Sicherheitsregel nicht aushebeln; ein Modell, das etwas als dringend erkennt, das keine
Regel abdeckt, wird nicht heruntergestuft.

## Ein regelbasierter Demo-Modus statt gar keiner Funktion

Ohne API-Schlüssel wäre die Anwendung tot – man könnte den Ablauf nicht zeigen, nicht testen, nicht
verkaufen. Statt ein Modell vorzutäuschen, gibt es einen ausdrücklich als Regelwerk gekennzeichneten
Provider: Signalwörter, reguläre Ausdrücke, Textvorlagen. Er trägt `isDemo: true`, das steht in der
Seitenleiste, auf jeder Freigabe und in jedem Protokolleintrag. Aufgaben, die ohne Modell nicht
sinnvoll gehen – etwa freie Fragen im Assistenten – sagen das offen, statt etwas zu erfinden.

## Warteschlange in der Datenbank statt in Redis

Die Anforderungen lauten: wiederholbar, idempotent, nachvollziehbar. Genau das ist eine Tabelle mit
Status, Versuchszähler, Ausführungszeitpunkt und Fehlertext – mit dem Vorteil, dass fehlgeschlagene
Aufträge im Adminbereich sichtbar sind, statt in einem separaten System zu liegen. Für die
Größenordnung eines Handwerksbetriebs (Dutzende Nachrichten am Tag, nicht Tausende pro Sekunde)
ist das reichlich. Der Vertrag (`enqueue` / `registerJob` / `runDueJobs`) ist so geschnitten, dass
ein Redis-Backend später eintreten kann.

## Die Mandantenschranke als Proxy statt als Konvention

Prisma Row-Level-Security oder eine Konvention „bitte immer `tenantId` mitgeben" verlassen sich
darauf, dass niemand es vergisst. Der Proxy in `tenant-db.ts` erzwingt es: Er ergänzt die
Bedingung, prüft Schreibdaten und wirft bei einer fremden ID. Der Preis ist, dass `tenantId` bei
`create` ausdrücklich im Code steht – dadurch bleiben die Prisma-Typen vollständig erhalten,
einschließlich `include` und `select`. Der Nutzen: die Trennung ist getestet und nicht nur
verabredet (`tests/tenant-isolation.test.ts`).

## Deutsche Oberfläche, deutsche Fachbegriffe

Zielgruppe sind Betriebe, keine Entwicklungsteams. Deshalb „AI-Assistent" statt „LLM",
„AI-Verbrauch" statt „Token Usage", „Freigabe" statt „Human-in-the-Loop", „Vertrauen" statt
„Confidence". Der Code ist englisch, die Kommentare und alles, was Benutzer sehen, deutsch.

## Was fehlt und warum

| Fehlt                             | Grund                                                                 |
|-----------------------------------|-----------------------------------------------------------------------|
| Kalendersynchronisation           | Phase 2; Berechtigungen werden bereits angefragt                      |
| Texterkennung für Scans           | Braucht OCR oder ein Modell mit Bildverständnis; wird offen angezeigt  |
| Stripe-Abwicklung                 | Datenmodell steht, Zahlungsintegration ist eigener Umfang             |
| Visueller Workflow-Editor         | Schritte sind bereits Daten; die Oberfläche ist Phase 2               |
| Angebote und Rechnungen           | Phase 3 laut Produktstrategie                                         |
| Löschung eines ganzen Betriebs    | Bewusst nur über den Support, nicht per Klick                         |

## Die Frage vor jedem weiteren Feature

> Spart diese Funktion dem Betrieb Büroarbeit?

Wenn nein, gehört sie nicht in die nächste Ausbaustufe.

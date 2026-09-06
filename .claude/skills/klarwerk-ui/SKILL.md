---
name: klarwerk-ui
description: Designsystem und UI-Regeln für Klarwerk. Vor jeder Arbeit an Oberfläche, Komponenten, Farben, Typografie, Tabellen, Formularen oder UI-Texten lesen — auch bei kleinen Änderungen an bestehenden Screens.
---

# Klarwerk – Oberfläche

## Für wen das hier gebaut wird

Verwaltungssoftware für Handwerksbetriebe mit 5 bis 50 Mitarbeitenden. Am
Bildschirm sitzen Meister und Büroleitung, oft im Werkstattbüro oder
Baucontainer, häufig auf 1366×768. Die Hauptaufgabe ist nicht "erkunden",
sondern abarbeiten: Freigaben, Aufträge, Termine, Rechnungen.

Daraus folgt die Leitlinie: **Ruhe und Dichte statt Effekt.** Vorsprung zeigt
sich darin, dass jemand nach drei Tagen die Auftragsliste blind bedient — nicht
darin, dass die Software modern aussieht.

## Farbe

Definiert in `src/app/globals.css` als Tailwind-Theme. Immer die Token
verwenden, nie rohe Hex-Werte in Komponenten.

| Rolle | Token | Verwendung |
|---|---|---|
| Neutrale | `ink-50` … `ink-900` | Warmes Graphit. Flächen, Linien, Text. |
| Marke | `brand-50` … `brand-900` | Petrol. Primäraktion, aktive Navigation, Links. |
| Dringend | `red-*` | Nur Priorität "Dringend" und Fehler. |
| Wartet, prüfen | `amber-*` | Nur offene Freigaben, niedriges Vertrauen, Demo-Modus. |
| Erledigt | `emerald-*` | Nur bestätigte Zustände. |
| Hinweis | `sky-*` | Nur neutrale Hinweise. |

**Signaldisziplin.** Rot und Bernstein sind auf der Baustelle Bedeutungsträger.
Sie stehen in dieser Software ausschließlich für Zustände. Nie für Betonung,
nie für Dekoration, nie für Verläufe. Wenn auf einem Screen dauerhaft Rot
steht, verliert es genau dann seine Wirkung, wenn es eilt.

**Textkontrast.** `ink-500` ist die hellste zulässige Farbe für Fließ- und
Metatext (4,7:1). `ink-400` liegt bei rund 3:1 und ist nur für Platzhalter,
deaktivierte Elemente und Nullwerte erlaubt.

**Farben aus der Datenbank** (`orderStatus.color`, `employee.color`,
`category.color`) dürfen nie die Textfarbe bestimmen — ein hell gepflegter Wert
wäre unlesbar. Sie erscheinen ausschließlich als schmaler Balken über
`<StatusTag>`.

## Schrift

IBM Plex Sans für alles, IBM Plex Mono ausschließlich für Kennungen, die
vorgelesen oder abgetippt werden: Auftrags-, Rechnungs-, Belegnummern. Dafür
gibt es `<Ref>`. Mono ist **keine** Auszeichnung für Labels oder Metadaten.

Zahlen stehen in dieser Software fast immer untereinander. Alles, was eine Zahl
enthält, bekommt `data-numeric` oder steht in einer `<table>` — beides schaltet
Tabellenziffern.

Keine Versalien-Beschriftungen. Sie lesen sich langsamer und tragen keine
Information, die die Position im Layout nicht schon trägt.

## Struktur und Dichte

- Trennung durch **Linien** (`border-ink-200`), nicht durch Schatten. Schatten
  bleiben Overlays vorbehalten, die wirklich über dem Inhalt schweben.
- Radien sind knapp gestuft (`--radius-*` in `globals.css`). Kanten
  signalisieren Bedienbarkeit, keine Weichheit.
- Bedienelemente mindestens 32 px hoch (`min-h-8`), damit sie am Touchgerät
  in der Werkstatt sicher zu treffen sind.
- Zusammengehörige Zahlen stehen in **einer** Leiste mit Haarlinien
  (`gap-px` auf `bg-ink-200`), nicht in Einzelkarten. Sechs gleiche Karten
  nebeneinander sind der generische SaaS-Baukasten.
- Fließtext und Beschreibungen laufen auf `max-w-[65ch]`, Container dürfen
  breit sein.

## Listen sind der Hauptbildschirm

Jede Liste mit mehr als zwei Angaben pro Zeile wird eine echte Tabelle über
`<Table>` / `<Th>` / `<Td>`, nicht ein Stapel aus Zeilen mit
Mittelpunkt-Ketten (`A · B · C`). Ausgerichtete Spalten sind der ganze Grund,
warum eine Liste schneller zu lesen ist als ein Absatz.

Regeln:
- Kopfzeile läuft mit (`kw-table-head`).
- Datum und Beträge rechtsbündig, Text linksbündig.
- Titel einzeilig abschneiden (`max-w-0` auf der Zelle, `truncate` auf dem
  Link, voller Text in `title`). Gleich hohe Zeilen überfliegt man schneller.
- Fehlende Werte als `—`, nicht als leere Zelle.
- Ausnahmen bekommen Farbe, der Normalfall nicht. "Normal" priorisierte
  Aufträge tragen keine Markierung.

## Sprache

- Aus Sicht der Nutzenden benennen, nicht aus Sicht des Systems.
- Schaltflächen sagen, was passiert: "Freigaben prüfen", nicht "Absenden".
  Eine Aktion behält ihren Namen durch den ganzen Ablauf.
- Fehler erklären, was passiert ist und was jetzt zu tun ist. Sie
  entschuldigen sich nicht und bleiben nie vage.
- Leere Zustände sind eine Aufforderung, keine Stimmung.
- Sie-Form, keine Emoji, keine Begrüßungsfloskeln als Überschrift.

## Bewegung

Nur als Antwort auf eine Handlung — Öffnen, Aufklappen, Bestätigen — und nur,
um zu zeigen, was sich geändert hat. Keine Einblendungen beim Laden, keine
Hover-Animationen auf Karten. `prefers-reduced-motion` ist global respektiert.

## Rückmeldung nach einer Aktion

Server Actions rufen `revalidatePath` auf. Dadurch rendert die Serverkomponente
neu und der entschiedene Vorgang fällt aus der Liste — **zusammen mit jeder
Meldung, die innerhalb dieses Vorgangs steht.** React verwirft den Effekt der
abgehängten Komponente, die Meldung erscheint also nie.

Daraus folgen zwei Regeln:

1. Rückmeldung läuft über `useToast()` aus `src/components/app/toast.tsx`. Der
   Provider liegt in der App-Shell und bleibt stehen, wenn Listen neu laden.
2. Der Toast wird **an der Aufrufstelle** ausgelöst, nicht in einem `useEffect`:

   ```tsx
   async function handleApprove(formData: FormData) {
     const result = await approveAction({}, formData);
     toast({ tone: "success", title: …, items: … });
   }
   <form action={handleApprove}>
   ```

   Diese Funktion läuft zu Ende, auch wenn die Komponente längst entfernt ist.
   `useActionState` mit einer Meldung in der Karte funktioniert hier nicht.

Die Meldung nennt konkret, was passiert ist ("Auftrag A-2026-0015 angelegt,
Terminvorschlag 15.09., Antwortentwurf erstellt"), nicht nur "Gespeichert".
Erfolge verschwinden nach sieben Sekunden, Fehler bleiben stehen, bis sie
jemand schließt.

## Übersicht und Arbeitsfläche trennen

Die Übersicht beantwortet "was wartet und wie dringend". Entschieden wird auf
der Fachseite. Vollständige Bearbeitungskarten gehören nicht auf das Dashboard:
drei offene Freigaben als volle Karten ergaben 3462 px Seitenhöhe bei 720 px
Fensterhöhe. Lange Inhalte wie Antwortentwürfe stehen in einem `<details>`.

## Barrierefreiheit

Geprüft mit axe-core über alle Routen; der Stand ist verstoßfrei. Was dabei
gelernt wurde:

- **Kontrast gegen die tatsächliche Fläche rechnen, nicht gegen Weiß.** Die
  Seitenfläche ist `ink-100`. `ink-500` ist die hellste zulässige Textfarbe und
  hält dort 4,6:1.
- **Keine Deckkraft zum Abschwächen.** `opacity-55` auf Text ergab 2,2:1.
  Abstufung läuft über eine hellere Textfarbe, die den Grenzwert weiter hält.
- **Waagerecht scrollbare Bereiche brauchen `tabIndex={0}`** plus `role="region"`
  und `aria-label`, sonst sind sie nur mit der Maus zu bewegen. Betrifft jede
  Tabelle und jedes breite Raster.
- **Platzhalter sind keine Beschriftung.** Jedes Eingabefeld hat ein `<label>` —
  sichtbar oder `sr-only`.
- **Jede Seite setzt `export const metadata`.** Der Titel ist die schnellste
  Ortsangabe für Screenreader, Verlauf und Fensterleiste.
- Ein einziger Fokusstil, global in `globals.css` über `:focus-visible`.
  Nie `outline: none` ohne Ersatz.
- Tastaturbedienung ist für Büroarbeit der schnellere Weg und muss auf jedem
  Screen vollständig funktionieren. Der Sprunglink in der App-Shell überspringt
  die zwölf Navigationsziele.
- Farbe ist nie der einzige Träger einer Information: neben dem roten Balken
  steht das Wort "Dringend".
- Aufzählungszeichen und Nummern kommen aus `list-disc`/`list-decimal`, nicht
  als "•" oder "1." im Text — sonst liest der Screenreader sie mit.

## Verknüpfte Auswahlfelder

Felder, die fachlich zusammenhängen, dürfen sich nicht widersprechen. Ein
Auftrag gehört zu höchstens einem Kunden – also setzt die Auswahl eines
Auftrags den Kunden mit, und die Auswahl eines Kunden schränkt die Aufträge
ein. Solche Regeln kommen als reine Funktionen in `src/lib/` und bekommen
Tests (`src/lib/document-links.ts`, `tests/document-links.test.ts`); im
Formular steht dann nur noch die Zuordnung von Ereignis zu Regel.

Steht der Bezug bereits fest – etwa beim Hochladen direkt am Auftrag – entfallen
die Auswahlfelder ganz und der Bezug geht als verstecktes Feld mit.

## Zustände, die jede Seite hat

`(app)/loading.tsx`, `(app)/error.tsx` und `(app)/not-found.tsx` decken Laden,
Fehler und fehlende Datensätze ab. Fehlermeldungen sagen, was passiert ist und
was als Nächstes zu tun ist, und bieten einen Weg zurück.

## Wo was liegt

- `src/app/globals.css` – Token, Basisstile, Fokus, Scrollbalken.
- `src/components/ui/index.tsx` – alle Bausteine. Neue Muster kommen hierher,
  nicht als Einzelfall in eine Seite.
- `src/components/app/` – fachliche Bausteine (Freigabekarte, Navigation).
- `src/app/(app)/auftraege/page.tsx` – Referenz für Listen.
- `src/app/(app)/dashboard/page.tsx` – Referenz für Kennzahlen.

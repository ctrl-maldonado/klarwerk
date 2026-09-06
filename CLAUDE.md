# Klarwerk

KI-Backoffice für Handwerksbetriebe. Next.js 15 (App Router), Prisma/Postgres,
Tailwind v4, mandantenfähig über `tenantDb()`.

## Oberfläche

Vor jeder Arbeit an UI, Farben, Typografie, Tabellen, Formularen oder UI-Texten
gilt das Designsystem in `.claude/skills/klarwerk-ui/SKILL.md`. Kurzfassung:

- Token aus `src/app/globals.css` verwenden, keine rohen Hex-Werte.
- Rot und Bernstein sind ausschließlich Signalfarben für Zustände.
- Bausteine kommen aus `src/components/ui`, nicht als Einzelfall in eine Seite.
- Listen mit mehr als zwei Angaben pro Zeile werden echte Tabellen.

## Befehle

```bash
npm run dev        # Entwicklungsserver
npm run typecheck  # tsc --noEmit
npm run test       # vitest
npm run db:up      # Postgres (5433) und Redis (6380)
npm run db:seed    # Demo-Betrieb
```

Port 3000 ist auf diesem Rechner belegt; `.claude/launch.json` weicht
automatisch aus.

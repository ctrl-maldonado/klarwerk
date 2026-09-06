"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Tabellenzeile, die als Ganzes zum Datensatz führt.

   Am Werkstattrechner wird mit der Maus überflogen und geklickt, nicht auf den
   Titel gezielt. Eine Zeile, die nur an einem Wort reagiert, kostet bei jedem
   Vorgang einen Zielversuch.

   Die Zeile bekommt bewusst weder `tabIndex` noch `role="button"`: die erste
   Zelle enthält weiterhin einen echten Verweis. Der trägt Tastatur, mittlere
   Maustaste und "Link kopieren" – eine zweite, gleichbedeutende Station im
   Tabulatorlauf wäre für Screenreader nur Lärm.
--------------------------------------------------------------------------- */
export function LinkedRow({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();

  return (
    <tr
      className={cn("cursor-pointer transition-colors hover:bg-ink-50", className)}
      onClick={(event) => {
        // Verweise, Schaltflächen und Eingabefelder in der Zeile behalten ihr
        // eigenes Ziel – etwa der Kunde, der zur Kundenakte führt.
        if ((event.target as HTMLElement).closest("a, button, input, label, select, textarea")) return;
        // Wer Text markiert, wollte lesen und nicht navigieren.
        if (window.getSelection()?.toString()) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}

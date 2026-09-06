"use client";

import { useEffect } from "react";
import { Button, Card, LinkButton } from "@/components/ui";

/**
 * Vorher zeigte ein Fehler den Standardbildschirm von Next.js – ohne Bezug zur
 * Anwendung und ohne Weg zurück. Die Meldung sagt jetzt, was passiert ist und
 * was als Nächstes zu tun ist.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-xl">
      <div className="px-6 py-8">
        <h1 className="text-lg font-semibold text-ink-900">Diese Seite konnte nicht geladen werden</h1>
        <p className="mt-2 text-sm text-ink-600">
          Ihre Daten sind unverändert. Versuchen Sie es erneut – bleibt der Fehler bestehen, hilft der
          Eintrag im Protokoll bei der Klärung.
        </p>
        {error.digest ? (
          <p className="mt-3 text-sm text-ink-500">
            Kennung für die Fehlersuche: <span className="font-mono text-xs">{error.digest}</span>
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={reset}>Erneut versuchen</Button>
          <LinkButton href="/dashboard">Zur Übersicht</LinkButton>
        </div>
      </div>
    </Card>
  );
}

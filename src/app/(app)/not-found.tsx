import { Card, LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <Card className="mx-auto max-w-xl">
      <div className="px-6 py-8">
        <h1 className="text-lg font-semibold text-ink-900">Diesen Eintrag gibt es nicht</h1>
        <p className="mt-2 text-sm text-ink-600">
          Der Vorgang wurde gelöscht oder die Adresse stimmt nicht. Über die Navigation kommen Sie zurück
          zu den offenen Aufgaben.
        </p>
        <div className="mt-5">
          <LinkButton href="/dashboard" variant="primary">
            Zur Übersicht
          </LinkButton>
        </div>
      </div>
    </Card>
  );
}

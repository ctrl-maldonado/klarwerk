import type { Metadata } from "next";
import { requireOnboarded } from "@/modules/auth/context";
import { tenantDb } from "@/lib/tenant-db";
import { Alert, Card, CardBody, CardHeader, LinkButton } from "@/components/ui";
import { RetentionForm } from "./retention-form";

export const metadata: Metadata = { title: "Datenschutz" };


export default async function PrivacyPage() {
  const context = await requireOnboarded();
  const settings = context.tenant.settings;
  const db = tenantDb(context.tenant.id);

  const [customers, emails, documents, auditLogs] = await Promise.all([
    db.customer.count(),
    db.email.count(),
    db.document.count(),
    db.auditLog.count(),
  ]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Gespeicherte Daten" description="Was Klarwerk für diesen Betrieb vorhält." />
        <CardBody className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-2xl font-semibold text-ink-900">{customers}</p>
            <p className="text-ink-500">Kunden</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-ink-900">{emails}</p>
            <p className="text-ink-500">Nachrichten</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-ink-900">{documents}</p>
            <p className="text-ink-500">Dokumente</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-ink-900">{auditLogs}</p>
            <p className="text-ink-500">Protokolleinträge</p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Aufbewahrung und AI-Datenweitergabe" />
        <CardBody>
          <RetentionForm
            canWrite={context.can("settings:write")}
            initial={{
              retentionDaysEmails: settings?.retentionDaysEmails ?? 1095,
              retentionDaysAuditLogs: settings?.retentionDaysAuditLogs ?? 2555,
              shareCustomerDataWithAI: settings?.shareCustomerDataWithAI ?? true,
            }}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Datenexport" description="Alle Daten dieses Betriebs als maschinenlesbare Datei." />
        <CardBody className="space-y-3">
          <LinkButton href="/api/datenschutz/export" variant="secondary">
            Export herunterladen (JSON)
          </LinkButton>
          <p className="text-xs text-ink-500">
            Der Export enthält Stammdaten, Aufträge, Termine, Nachrichten, Dokumentenverzeichnis und Protokoll. Jeder
            Export wird protokolliert.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Löschung" />
        <CardBody className="space-y-3">
          <Alert tone="warning" title="Löschung einzelner Personen">
            Einen Kunden samt Nachrichten und Dokumenten löschen Sie in der Kundenakte. Aufträge bleiben anonymisiert
            erhalten, damit betriebliche Aufbewahrungspflichten erfüllbar bleiben. Protokolleinträge bleiben bestehen,
            sind aber nicht mehr personenbeziehbar.
          </Alert>
          <p className="text-sm text-ink-600">
            Die vollständige Löschung des Betriebskontos veranlassen Sie über den Support. Sie ist bewusst nicht mit
            einem Klick möglich und wird protokolliert.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Grundsätze" />
        <CardBody className="space-y-1.5 text-sm text-ink-600">
          <p>• Daten verschiedener Betriebe werden strikt getrennt gehalten.</p>
          <p>• An AI-Anbieter wird nur übertragen, was für die jeweilige Aufgabe nötig ist.</p>
          <p>• Kundendaten werden nicht zum Training von Modellen verwendet.</p>
          <p>• Zugangsdaten und Schlüssel werden verschlüsselt gespeichert und nie an den Browser ausgeliefert.</p>
          <p>• Jede sicherheitsrelevante Aktion ist im Protokoll nachvollziehbar.</p>
        </CardBody>
      </Card>
    </div>
  );
}

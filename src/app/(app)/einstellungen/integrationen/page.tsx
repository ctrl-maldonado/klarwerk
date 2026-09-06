import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboarded } from "@/modules/auth/context";
import { tenantDb } from "@/lib/tenant-db";
import { env } from "@/lib/env";
import { Alert, Badge, Card, CardBody, CardHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Integrationen" };


const STATUS_TONES: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  CONNECTED: "success",
  ERROR: "danger",
  EXPIRED: "warning",
  DISCONNECTED: "neutral",
};

export default async function IntegrationsPage() {
  const context = await requireOnboarded();
  const integrations = await tenantDb(context.tenant.id).integration.findMany({ orderBy: { createdAt: "asc" } });

  const available = [
    {
      key: "microsoft365",
      name: "Microsoft 365 / Outlook",
      description: "Postfach und Kalender.",
      configured: env.microsoft.configured,
      startUrl: "/api/integrations/microsoft/start",
    },
    {
      key: "google",
      name: "Google Workspace / Gmail",
      description: "Postfach und Kalender.",
      configured: env.google.configured,
      startUrl: "/api/integrations/google/start",
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Verbundene Systeme" />
        <CardBody className="divide-y divide-ink-100 px-0 py-0">
          {integrations.length ? (
            integrations.map((integration) => (
              <div key={integration.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-800">{integration.displayName || integration.providerKey}</p>
                  <p className="text-xs text-ink-500">
                    {integration.type} · {integration.accountEmail ?? "—"}
                    {integration.lastSyncAt ? ` · zuletzt abgerufen ${formatDateTime(integration.lastSyncAt)}` : ""}
                  </p>
                  {integration.lastError ? <p className="mt-1 text-xs text-red-600">{integration.lastError}</p> : null}
                </div>
                <Badge tone={STATUS_TONES[integration.status] ?? "neutral"}>{integration.status}</Badge>
              </div>
            ))
          ) : (
            <p className="px-5 py-4 text-sm text-ink-500">Noch nichts verbunden.</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Verfügbare Anbindungen" />
        <CardBody className="space-y-3">
          {available.map((provider) => (
            <div key={provider.key} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-ink-800">{provider.name}</p>
                <p className="text-xs text-ink-500">{provider.description}</p>
              </div>
              {provider.configured ? (
                <Link href={provider.startUrl} className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700">
                  Verbinden
                </Link>
              ) : (
                <Badge tone="neutral">nicht konfiguriert</Badge>
              )}
            </div>
          ))}
          <Alert tone="info">
            Weitere Anbindungen (Handwerkersoftware, DATEV, WhatsApp Business, Telefonanlagen) folgen über dieselbe
            Schnittstelle. Für eigene Systeme steht die REST-Schnittstelle unter{" "}
            <code className="rounded bg-white px-1">/api/v1</code> bereit.
          </Alert>
        </CardBody>
      </Card>
    </div>
  );
}

import type { Metadata } from "next";
import { requireOnboarded } from "@/modules/auth/context";
import { tenantDb } from "@/lib/tenant-db";
import { prisma } from "@/lib/db";
import { getAIStatus } from "@/modules/ai/service";
import { Alert, Badge, Button, Card, CardBody, CardHeader } from "@/components/ui";
import { ActiveProviderForm, AIProviderForm, type ProviderInitial } from "./provider-form";
import { AI_KEY_PROVIDERS } from "@/modules/ai/provider-catalog";
import { toggleAIActionAction } from "../actions";

export const metadata: Metadata = { title: "KI-Modell" };


const RISK_LABELS: Record<string, string> = { LOW: "gering", MEDIUM: "mittel", HIGH: "hoch" };

export default async function AISettingsPage() {
  const context = await requireOnboarded();
  const db = tenantDb(context.tenant.id);

  const [status, providers, actions, prompts] = await Promise.all([
    getAIStatus(context.tenant.id),
    db.aIProviderConfig.findMany({ orderBy: { providerKey: "asc" } }),
    db.aIAction.findMany({ orderBy: [{ riskLevel: "asc" }, { key: "asc" }] }),
    prisma.promptTemplate.findMany({
      where: { OR: [{ tenantId: null }, { tenantId: context.tenant.id }] },
      include: { versions: { orderBy: { version: "desc" } } },
    }),
  ]);

  const initialByProvider: Record<string, ProviderInitial> = {};
  for (const provider of providers) {
    const scope = (provider.dataScope as Record<string, boolean>) ?? {};
    initialByProvider[provider.providerKey] = {
      model: provider.model,
      baseUrl: provider.baseUrl ?? "",
      hasKey: Boolean(provider.encryptedApiKey),
      isDefault: provider.isDefault,
      scope: {
        emailContent: scope.emailContent ?? true,
        customerData: scope.customerData ?? true,
        attachments: scope.attachments ?? false,
      },
    };
  }

  const activeProviderKey = providers.find((provider) => provider.isDefault)?.providerKey ?? "demo";
  // Das Zugangsformular öffnet beim aktiven Anbieter, sonst beim ersten mit Schlüsselbedarf.
  const formProviderKey = AI_KEY_PROVIDERS.some((entry) => entry.key === activeProviderKey)
    ? activeProviderKey
    : AI_KEY_PROVIDERS[0].key;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Status" />
        <CardBody>
          {status.isDemo ? (
            <Alert tone="warning" title="Demo-Modus">
              {status.message}
            </Alert>
          ) : (
            <Alert tone="success" title="Verbunden">
              {status.message}
            </Alert>
          )}
        </CardBody>
      </Card>

      {context.can("ai:configure") ? (
        <Card>
          <CardHeader
            title="AI-Zugang"
            description="Der Schlüssel wird verschlüsselt gespeichert und niemals an den Browser ausgeliefert."
          />
          <CardBody>
            <div className="space-y-6">
              <ActiveProviderForm activeProviderKey={activeProviderKey} providers={initialByProvider} />
              <hr className="border-ink-200" />
              <AIProviderForm providers={initialByProvider} defaultProviderKey={formProviderKey} />
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Welche Daten gehen an welchen Anbieter?"
          description="Übertragen wird nur, was für die jeweilige Aufgabe nötig ist."
        />
        <CardBody className="space-y-4">
          {providers.map((provider) => {
            const providerScope = (provider.dataScope as Record<string, boolean>) ?? {};
            return (
              <div key={provider.id} className="rounded-lg border border-ink-200 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink-900">{provider.name}</p>
                  <div className="flex gap-1.5">
                    {provider.isDefault ? <Badge tone="brand">aktiv</Badge> : null}
                    <Badge tone={provider.isEnabled ? "success" : "neutral"}>{provider.isEnabled ? "aktiviert" : "deaktiviert"}</Badge>
                  </div>
                </div>
                <p className="mt-1 text-xs text-ink-500">Modell: {provider.model}</p>
                <ul className="mt-2 space-y-0.5 text-sm text-ink-600">
                  <li>{providerScope.emailContent ? "✓" : "✗"} Inhalt eingehender Nachrichten</li>
                  <li>{providerScope.customerData ? "✓" : "✗"} Name und Adresse des Kunden</li>
                  <li>{providerScope.attachments ? "✓" : "✗"} Anhänge und Dokumente</li>
                  <li>✗ Zahlungsdaten</li>
                </ul>
              </div>
            );
          })}
          <p className="text-xs text-ink-500">
            Keine Kundendaten werden zum Training von Modellen verwendet. Vertragliche Zusicherungen des Anbieters sind
            gesondert zu prüfen.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Erlaubte Aktionen"
          description="Klarwerk arbeitet ausschließlich über diese Werkzeuge – nie direkt auf der Datenbank."
        />
        <CardBody className="divide-y divide-ink-100 px-0 py-0">
          {actions.map((action) => (
            <div key={action.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink-800">{action.name}</span>
                  <Badge tone={action.riskLevel === "HIGH" ? "danger" : action.riskLevel === "MEDIUM" ? "warning" : "neutral"}>
                    Risiko {RISK_LABELS[action.riskLevel]}
                  </Badge>
                  {action.requiredPermission ? (
                    <span className="text-xs text-ink-500">benötigt {action.requiredPermission}</span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-ink-500">{action.description}</p>
              </div>
              {context.can("ai:configure") ? (
                <form action={toggleAIActionAction}>
                  <input type="hidden" name="actionId" value={action.id} />
                  <Button type="submit" variant="secondary" size="sm">
                    {action.isEnabled ? "Deaktivieren" : "Aktivieren"}
                  </Button>
                </form>
              ) : (
                <Badge tone={action.isEnabled ? "success" : "neutral"}>{action.isEnabled ? "aktiv" : "aus"}</Badge>
              )}
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Anweisungen (Prompts)" description="Versioniert – ältere Fassungen bleiben nachvollziehbar." />
        <CardBody className="divide-y divide-ink-100 px-0 py-0">
          {prompts.map((prompt) => {
            const active = prompt.versions.find((version) => version.isActive) ?? prompt.versions[0];
            return (
              <div key={prompt.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink-800">{prompt.name}</p>
                  <span className="text-xs text-ink-500">
                    Version {active?.version ?? "—"} · {prompt.versions.length} Fassungen
                    {active?.errorCount ? ` · ${active.errorCount} Fehler` : ""}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-500">{prompt.description}</p>
              </div>
            );
          })}
        </CardBody>
      </Card>
    </div>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/modules/auth/context";
import { env } from "@/lib/env";
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/utils";
import { currentPeriodKey } from "@/modules/billing/usage";
import { logoutAction } from "../../(auth)/actions";

export const metadata: Metadata = { title: "Administration" };


/**
 * Plattform-Administration (§36).
 * Zeigt ausschließlich Betriebs- und Verbrauchskennzahlen – keine Kundeninhalte.
 * Für Support-Einblick ist eine befristete, protokollierte Freigabe des Betriebs nötig.
 */
export default async function AdminPage() {
  const context = await getAuthContext();
  const isPlatformAdmin =
    context?.user.isPlatformAdmin || (context ? env.platformAdminEmails.includes(context.user.email.toLowerCase()) : false);

  if (!context) redirect("/login");
  if (!isPlatformAdmin) redirect("/dashboard");

  const period = currentPeriodKey();
  const [tenants, usage, failedJobs, failedExecutions, grants] = await Promise.all([
    prisma.tenant.findMany({
      include: {
        subscription: true,
        _count: { select: { users: true, customers: true, orders: true, emails: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.usageRecord.groupBy({ by: ["tenantId", "metric"], where: { periodKey: period }, _sum: { quantity: true } }),
    prisma.job.findMany({ where: { status: { in: ["DEAD", "FAILED"] } }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.aIExecution.groupBy({ by: ["tenantId"], where: { status: "FAILED" }, _count: { _all: true } }),
    prisma.supportAccessGrant.findMany({ where: { revokedAt: null, expiresAt: { gt: new Date() } }, include: { tenant: true } }),
  ]);

  const usageByTenant = new Map<string, Record<string, number>>();
  for (const row of usage) {
    const entry = usageByTenant.get(row.tenantId) ?? {};
    entry[row.metric] = row._sum.quantity ?? 0;
    usageByTenant.set(row.tenantId, entry);
  }
  const failuresByTenant = Object.fromEntries(failedExecutions.map((row) => [row.tenantId, row._count._all]));

  const aiCost = await prisma.aIExecution.groupBy({
    by: ["tenantId"],
    where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    _sum: { costMicroCents: true },
  });
  const costByTenant = Object.fromEntries(aiCost.map((row) => [row.tenantId, (row._sum.costMicroCents ?? 0) / 1_000_000]));

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <PageHeader title="Plattform-Administration" description={`Angemeldet als ${context.user.name}`} />
        <form action={logoutAction}>
          <button type="submit" className="text-sm text-ink-600 hover:underline">
            Abmelden
          </button>
        </form>
      </div>

      <div className="mb-6">
        <Alert tone="info" title="Einsicht in Kundendaten">
          Diese Ansicht enthält bewusst keine Inhalte aus Kundenpostfächern oder Akten. Support-Einblick erfordert eine
          befristete Freigabe des jeweiligen Betriebs und wird protokolliert.
        </Alert>
      </div>

      <Card className="mb-6">
        <CardHeader title="Betriebe" description={`${tenants.length} Mandanten`} />
        <CardBody className="divide-y divide-ink-100 px-0 py-0">
          {tenants.map((tenant) => {
            const tenantUsage = usageByTenant.get(tenant.id) ?? {};
            return (
              <div key={tenant.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-ink-900">
                    {tenant.name}
                    <Badge tone={tenant.subscription?.status === "ACTIVE" ? "success" : "warning"}>
                      {tenant.subscription?.plan ?? "—"}
                    </Badge>
                    {tenant.onboardingCompleted ? null : <Badge tone="neutral">Einrichtung offen</Badge>}
                  </p>
                  <p className="text-xs text-ink-500">
                    seit {formatDate(tenant.createdAt)} · {tenant._count.users} Benutzer · {tenant._count.customers} Kunden ·{" "}
                    {tenant._count.orders} Aufträge · {tenant._count.emails} Nachrichten
                  </p>
                </div>
                <div className="text-right text-xs text-ink-500">
                  <p>{tenantUsage.ai_calls ?? 0} AI-Vorgänge im Monat</p>
                  <p>
                    Kosten 30 Tage:{" "}
                    {(costByTenant[tenant.id] ?? 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                  </p>
                  {failuresByTenant[tenant.id] ? (
                    <p className="text-red-600">{failuresByTenant[tenant.id]} AI-Fehler</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Fehlgeschlagene Hintergrundaufträge" />
          <CardBody className="space-y-2 text-sm">
            {failedJobs.length ? (
              failedJobs.map((job) => (
                <div key={job.id}>
                  <p className="text-ink-800">{job.key}</p>
                  <p className="text-xs text-red-600">{job.lastError}</p>
                  <p className="text-xs text-ink-500">
                    {formatDateTime(job.createdAt)} · {job.attempts} Versuche
                  </p>
                </div>
              ))
            ) : (
              <p className="text-ink-500">Keine Fehler.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Aktive Support-Zugriffe" />
          <CardBody className="space-y-2 text-sm">
            {grants.length ? (
              grants.map((grant) => (
                <div key={grant.id}>
                  <p className="text-ink-800">{grant.tenant.name}</p>
                  <p className="text-xs text-ink-500">
                    bis {formatDateTime(grant.expiresAt)} · {grant.reason}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-ink-500">Kein aktiver Support-Zugriff.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

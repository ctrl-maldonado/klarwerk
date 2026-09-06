import Link from "next/link";
import { requireAuth } from "@/modules/auth/context";
import { redirect } from "next/navigation";
import {
  MobileNav,
  SidebarNav,
  type NavItem,
} from "@/components/app/sidebar-nav";
import { ToastProvider } from "@/components/app/toast";
import { getAIStatus } from "@/modules/ai/service";
import { tenantDb } from "@/lib/tenant-db";
import { logoutAction } from "../(auth)/actions";
import { Badge } from "@/components/ui";
import { initials } from "@/lib/utils";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requireAuth();
  if (!context.tenant.onboardingCompleted) redirect("/onboarding");

  const db = tenantDb(context.tenant.id);
  const [pendingApprovals, unreadEmails, aiStatus] = await Promise.all([
    db.approvalRequest.count({ where: { status: "PENDING" } }),
    db.email.count({
      where: {
        direction: "INBOUND",
        status: { in: ["RECEIVED", "NEEDS_APPROVAL"] },
      },
    }),
    getAIStatus(context.tenant.id),
  ]);

  const can = context.can;
  const primary: NavItem[] = [
    { href: "/dashboard", label: "Übersicht" },
    { href: "/freigaben", label: "Freigaben", badge: pendingApprovals },
  ];
  if (can("emails:read"))
    primary.push({ href: "/emails", label: "E-Mails", badge: unreadEmails });
  if (can("customers:read")) primary.push({ href: "/kunden", label: "Kunden" });
  if (can("orders:read"))
    primary.push({ href: "/auftraege", label: "Aufträge" });
  if (can("calendar:read"))
    primary.push({ href: "/kalender", label: "Kalender" });
  if (can("documents:read"))
    primary.push({ href: "/dokumente", label: "Dokumente" });

  const secondary: NavItem[] = [];
  if (can("ai:use"))
    secondary.push({ href: "/assistent", label: "AI-Assistent" });
  if (can("workflows:read"))
    secondary.push({ href: "/automationen", label: "Automationen" });
  if (can("analytics:read"))
    secondary.push({ href: "/auswertung", label: "Auswertung" });
  if (can("audit:read"))
    secondary.push({ href: "/protokoll", label: "Protokoll" });
  if (can("settings:read"))
    secondary.push({ href: "/einstellungen", label: "Einstellungen" });

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-ink-100">
        {/* Ohne Sprunglink muss sich die Tastaturbedienung auf jeder Seite durch
          zwölf Navigationsziele arbeiten, bevor der Inhalt beginnt. */}
        <a
          href="#inhalt"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          Direkt zum Inhalt
        </a>

        <aside
          aria-label="Bereichsnavigation"
          className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col self-start border-r border-ink-200 bg-white lg:flex"
        >
          <div className="flex items-center gap-2.5 border-b border-ink-200 px-4 py-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-brand-600 text-sm font-semibold text-white">
              K
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">
                Klarwerk
              </p>
              <p className="truncate text-xs text-ink-500">
                {context.tenant.name}
              </p>
            </div>
          </div>

          <SidebarNav
            groups={[
              { items: primary },
              { label: "Verwaltung", items: secondary },
            ]}
          />

          <div className="border-t border-ink-200 p-3">
            {aiStatus.isDemo ? (
              <div className="mb-3 border-l-2 border-l-amber-600 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <p className="font-semibold">Demo-Modus</p>
                <p className="mt-0.5">
                  Kein KI-Modell verbunden. Vorschläge entstehen aus festen
                  Regeln.
                </p>
              </div>
            ) : null}
            <div className="flex items-center gap-2.5 px-1 py-1">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-ink-200 text-xs font-medium text-ink-700">
                {initials(context.user.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink-900">
                  {context.user.name}
                </p>
                <p className="truncate text-xs text-ink-500">
                  {context.role?.name}
                </p>
              </div>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="mt-1 min-h-8 w-full rounded-lg px-1 py-1.5 text-left text-sm text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900"
              >
                Abmelden
              </button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-ink-200 bg-white px-4 py-2.5 lg:hidden">
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-brand-600 text-xs font-semibold text-white">
                K
              </span>
              <span className="text-sm font-semibold text-ink-900">
                Klarwerk
              </span>
            </Link>
            {pendingApprovals > 0 ? (
              <Link
                href="/freigaben"
                className="flex items-center gap-2 text-sm"
              >
                <Badge tone="warning">{pendingApprovals}</Badge>
                <span className="font-medium text-brand-700">
                  Freigaben öffnen
                </span>
              </Link>
            ) : null}
          </header>

          <MobileNav items={[...primary, ...secondary]} />

          <main
            id="inhalt"
            tabIndex={-1}
            className="flex-1 px-4 py-5 focus:outline-none sm:px-6 sm:py-6"
          >
            <div className="mx-auto max-w-[88rem]">{children}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}

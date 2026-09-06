import Link from "next/link";
import { requireOnboarded } from "@/modules/auth/context";
import { PageHeader } from "@/components/ui";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const context = await requireOnboarded();
  context.assert("settings:read");

  const tabs = [
    { href: "/einstellungen", label: "Allgemein" },
    { href: "/einstellungen/ai", label: "AI" },
    { href: "/einstellungen/team", label: "Team" },
    { href: "/einstellungen/integrationen", label: "Integrationen" },
    { href: "/einstellungen/datenschutz", label: "Datenschutz" },
  ];

  return (
    <>
      <PageHeader title="Einstellungen" description={context.tenant.name} />
      <div className="mb-6 flex flex-wrap gap-1">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="rounded-lg bg-white px-3 py-1.5 text-sm text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50"
          >
            {tab.label}
          </Link>
        ))}
      </div>
      {children}
    </>
  );
}

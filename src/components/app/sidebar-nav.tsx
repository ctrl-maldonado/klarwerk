"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  badge?: number;
}

export function SidebarNav({ groups }: { groups: Array<{ label?: string; items: NavItem[] }> }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Hauptnavigation" className="kw-scroll flex-1 overflow-y-auto py-2">
      {groups.map((group, index) => (
        <div key={group.label ?? index} className={index > 0 ? "mt-2 border-t border-ink-200 pt-2" : undefined}>
          {group.label ? <p className="px-4 py-1.5 text-xs text-ink-500">{group.label}</p> : null}
          <ul>
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      // Der aktive Eintrag wird durch eine Kante am Rand markiert,
                      // nicht durch eine eingefärbte Fläche: das hält die
                      // Markenfarbe für Aktionen frei und die Liste ruhig.
                      "flex min-h-8 items-center justify-between gap-2 border-l-2 px-4 py-1.5 text-sm transition-colors",
                      active
                        ? "border-l-brand-600 bg-ink-50 font-medium text-ink-900"
                        : "border-l-transparent text-ink-600 hover:bg-ink-50 hover:text-ink-900",
                    )}
                  >
                    <span className="truncate">{item.label}</span>
                    {item.badge ? (
                      <span
                        data-numeric
                        className={cn(
                          "min-w-4 rounded-sm px-1 text-center text-xs font-medium",
                          active ? "bg-brand-600 text-white" : "bg-ink-200 text-ink-700",
                        )}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Waagerechte Navigation für schmale Bildschirme. Sie braucht denselben
 *  aktiven Zustand wie die Seitenleiste – ohne ihn ist auf dem Telefon nicht
 *  erkennbar, wo man sich befindet. */
export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Hauptnavigation"
      className="kw-scroll flex gap-1 overflow-x-auto border-b border-ink-200 bg-white px-2 py-1.5 lg:hidden"
    >
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
              active
                ? "bg-ink-800 font-medium text-white"
                : "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
            )}
          >
            {item.label}
            {item.badge ? (
              <span
                data-numeric
                className={cn(
                  "min-w-4 rounded-sm px-1 text-center text-xs font-medium",
                  active ? "bg-white/20 text-white" : "bg-ink-200 text-ink-700",
                )}
              >
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

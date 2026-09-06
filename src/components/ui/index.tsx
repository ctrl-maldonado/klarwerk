import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Bausteine der Klarwerk-Oberfläche.

   Regeln, die hier durchgehalten werden:
   - Trennung durch Linien, nicht durch Schatten.
   - Rot und Bernstein nur für Zustände, nie für Betonung.
   - Keine Versalien-Labels: sie lesen sich langsamer und tragen keine
     Information, die die Position nicht schon trägt.
--------------------------------------------------------------------------- */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-xl border border-ink-200 bg-white", className)}>{children}</div>;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-ink-200 px-4 py-3", className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        {description ? <p className="mt-0.5 max-w-[60ch] text-sm text-ink-500">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-4 py-3.5", className)}>{children}</div>;
}

const buttonVariants = {
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  secondary: "bg-white text-ink-800 border border-ink-300 hover:bg-ink-50 hover:border-ink-400",
  danger: "bg-white text-red-700 border border-red-200 hover:bg-red-50 hover:border-red-500",
  ghost: "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
  subtle: "bg-ink-800 text-white hover:bg-ink-900",
};

// Mindestens 32 px hoch, damit die Ziele auch mit Arbeitshandschuhen am
// Touchgerät oder mit der Maus am Werkstattrechner sicher zu treffen sind.
const buttonSizes = {
  sm: "min-h-7 px-2.5 py-1 text-xs",
  md: "min-h-8 px-3 py-1.5 text-sm",
  lg: "min-h-9 px-4 py-2 text-sm",
};

export function buttonClass(
  variant: keyof typeof buttonVariants = "primary",
  size: keyof typeof buttonSizes = "md",
  className?: string,
) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    buttonVariants[variant],
    buttonSizes[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
}) {
  return (
    <button className={buttonClass(variant, size, className)} {...props}>
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

/* Etikett statt Pille: rechteckig, wie ein angeheftetes Schild am Auftrag.
   Runde Pillen lesen sich als Werbung, Etiketten als Sachstand. */
const badgeTones = {
  neutral: "bg-ink-100 text-ink-700",
  brand: "bg-brand-50 text-brand-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
  info: "bg-sky-50 text-sky-700",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: keyof typeof badgeTones;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium",
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-ink-200 pb-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {description ? <p className="mt-1 max-w-[65ch] text-sm text-ink-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-medium text-ink-800">{title}</p>
      {description ? <p className="max-w-[52ch] text-sm text-ink-500">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  href,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  href?: string;
  tone?: keyof typeof badgeTones;
}) {
  const content = (
    <div
      className={cn(
        "h-full border-l-2 bg-white px-3.5 py-3 transition-colors",
        tone === "danger" ? "border-l-red-600" : tone === "warning" ? "border-l-amber-600" : "border-l-transparent",
        href ? "hover:bg-ink-50" : null,
      )}
    >
      <p
        data-numeric
        className={cn(
          "text-2xl font-semibold leading-none",
          value === 0 || value === "0"
            ? "text-ink-400"
            : tone === "danger"
              ? "text-red-700"
              : tone === "warning"
                ? "text-amber-800"
                : "text-ink-900",
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-sm text-ink-600">{label}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-sm font-medium text-ink-800">{label}</span>
      {children}
      {hint && !error ? <span className="mt-1 block text-xs text-ink-500">{hint}</span> : null}
      {error ? (
        <span role="alert" className="mt-1 block text-xs font-medium text-red-700">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export const inputClass =
  "block w-full min-h-8 rounded-lg border border-ink-300 bg-white px-2.5 py-1.5 text-sm text-ink-900 placeholder:text-ink-400 hover:border-ink-400 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";

export function Alert({
  tone = "info",
  title,
  live = false,
  children,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  /** Für Meldungen, die erst als Ergebnis einer Aktion erscheinen. Ohne das
   *  bleibt der Ausgang einer Freigabe oder eines Formulars für Screenreader
   *  unbemerkt, weil sich der Fokus nicht bewegt. */
  live?: boolean;
  children: ReactNode;
}) {
  const tones = {
    info: "border-l-sky-600 bg-sky-50 text-sky-900",
    warning: "border-l-amber-600 bg-amber-50 text-amber-900",
    danger: "border-l-red-600 bg-red-50 text-red-900",
    success: "border-l-emerald-600 bg-emerald-50 text-emerald-900",
  };
  const urgent = tone === "danger" || tone === "warning";
  return (
    <div
      className={cn("border-l-2 px-4 py-3 text-sm", tones[tone])}
      role={live ? (urgent ? "alert" : "status") : undefined}
      aria-live={live && !urgent ? "polite" : undefined}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? "mt-1" : undefined}>{children}</div>
    </div>
  );
}

/* Vertrauen ist eine Messgröße, keine Warnung. Ein Wert von 78 % ist ein
   normaler Vorschlag und darf nicht in Signalfarbe erscheinen – sonst steht
   auf dem Bildschirm dauerhaft Alarm und der echte Ausreißer geht unter.
   Farbe bekommt der Balken erst, wenn der Wert tatsächlich zu niedrig ist. */
export const CONFIDENCE_LOW = 70;

export function ConfidenceBar({ value, label }: { value: number; label?: string }) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const low = percent < CONFIDENCE_LOW;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-16 overflow-hidden rounded-sm bg-ink-200">
        <div className={cn("h-full", low ? "bg-amber-600" : "bg-ink-600")} style={{ width: `${percent}%` }} />
      </div>
      <span data-numeric className={cn("text-xs", low ? "text-amber-800" : "text-ink-500")}>
        {percent} %{label ? ` ${label}` : ""}
      </span>
    </div>
  );
}

/* --- Kennungen -------------------------------------------------------------
   Auftrags-, Rechnungs- und Belegnummern werden vorgelesen, abgetippt und
   verglichen. Im Mono-Schnitt stehen die Stellen untereinander und 0/O sowie
   1/l bleiben unterscheidbar. Nur dafür – nicht für Beschriftungen. */
export function Ref({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-xs tracking-tight text-ink-600", className)}>{children}</span>;
}

/* --- Tabelle ---------------------------------------------------------------
   Listen sind der Hauptbildschirm dieser Software. Sie sind als echte Tabelle
   gebaut: ausgerichtete Spalten, mitlaufender Kopf, Zeilen ohne Zebra, weil
   Haarlinien bei dieser Dichte ruhiger sind. */
export function Table({
  children,
  caption,
  className,
}: {
  children: ReactNode;
  /** Beschreibt den Inhalt der Tabelle für Screenreader und benennt den
   *  scrollbaren Bereich. Pflicht, damit die Tabelle ohne Blick auf die
   *  Seitenüberschrift verständlich bleibt. */
  caption: string;
  className?: string;
}) {
  return (
    // tabIndex macht den waagerecht scrollbaren Bereich mit der Tastatur
    // erreichbar – ohne das lässt er sich nur mit der Maus bewegen.
    <div className="kw-scroll overflow-x-auto" tabIndex={0} role="region" aria-label={caption}>
      <table className={cn("w-full min-w-[52rem] border-collapse text-left text-sm", className)}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  className,
}: {
  children?: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-ink-200 px-3 py-2 text-xs font-medium text-ink-500",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className,
}: {
  children?: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td className={cn("px-3 py-2 align-middle", align === "right" ? "text-right" : "text-left", className)}>
      {children}
    </td>
  );
}

/* Zustand aus der Stammdatenpflege: die Farbe kommt aus der Datenbank und darf
   die Palette nicht übernehmen. Deshalb trägt sie nur einen schmalen Balken,
   der Text bleibt im Graphit der Oberfläche und damit immer lesbar. */
export function StatusTag({ label, color }: { label: string; color?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-ink-700">
      <span
        aria-hidden
        className="kw-status-dot h-3.5 w-1 shrink-0 rounded-xs"
        style={{ backgroundColor: color ?? "var(--color-ink-400)" }}
      />
      {label}
    </span>
  );
}

/* Klickbare Tabellenzeile. Liegt in einer eigenen Datei, weil sie den Router
   braucht und dieses Modul sonst vollständig zur Client-Komponente würde. */
export { LinkedRow } from "./linked-row";

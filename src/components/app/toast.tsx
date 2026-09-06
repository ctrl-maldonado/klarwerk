"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Rückmeldung, die das Neuladen der Liste überlebt.

   Server Actions rufen revalidatePath auf. Dadurch rendert die Serverkomponente
   neu und der entschiedene Vorgang fällt aus der Liste – zusammen mit jeder
   Meldung, die innerhalb dieses Vorgangs stand. Für die bedienende Person sah
   das so aus: klicken, etwas verschwindet, niemand sagt was passiert ist.

   Die Meldung muss deshalb außerhalb der Liste leben.
--------------------------------------------------------------------------- */

export type ToastTone = "success" | "error" | "info";

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
  /** Einzelschritte einer Aktion, z. B. was bei einer Freigabe ausgeführt wurde. */
  items?: string[];
}

interface ToastContextValue {
  toast: (entry: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast benötigt einen ToastProvider.");
  return value;
}

// Erfolge verschwinden von selbst. Fehler bleiben stehen, bis sie jemand
// geschlossen hat – eine fehlgeschlagene Ausführung darf nicht wegblinken.
const AUTO_DISMISS_MS = 7000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const toast = useCallback((entry: Omit<Toast, "id">) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { ...entry, id }]);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastRegion({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null;

  return (
    <div
      // aria-live meldet neue Einträge an, ohne den Fokus wegzureißen; Fehler
      // tragen zusätzlich role="alert" und werden sofort vorgelesen.
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
    >
      {toasts.map((entry) => (
        <ToastItem key={entry.id} toast={entry} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const isError = toast.tone === "error";

  useEffect(() => {
    if (isError) return;
    const timer = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [isError, onDismiss, toast.id]);

  const tones: Record<ToastTone, string> = {
    success: "border-l-emerald-600",
    error: "border-l-red-600",
    info: "border-l-sky-600",
  };

  return (
    <div
      role={isError ? "alert" : "status"}
      className={cn(
        "pointer-events-auto w-full max-w-md border border-ink-200 border-l-2 bg-white px-4 py-3 shadow-[0_2px_8px_rgba(28,26,23,0.12)]",
        tones[toast.tone],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-900">{toast.title}</p>
          {toast.detail ? <p className="mt-0.5 text-sm text-ink-600">{toast.detail}</p> : null}
          {toast.items?.length ? (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-sm text-ink-600">
              {toast.items.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="-m-1 shrink-0 rounded-lg p-1 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
        >
          <span className="sr-only">Meldung schließen</span>
          <span aria-hidden>✕</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Ohne diesen Zustand blieb beim Seitenwechsel die alte Seite stehen, bis die
 * Datenbankabfragen fertig waren – die Oberfläche wirkte eingefroren.
 */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="animate-pulse">
      <span className="sr-only">Seite wird geladen</span>
      <div className="mb-5 border-b border-ink-200 pb-4">
        <div className="h-5 w-48 rounded-lg bg-ink-200" />
        <div className="mt-2 h-4 w-72 rounded-lg bg-ink-200" />
      </div>
      <div className="border border-ink-200 bg-white">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 border-b border-ink-200 px-4 py-3 last:border-b-0">
            <div className="h-4 w-24 rounded-lg bg-ink-100" />
            <div className="h-4 flex-1 rounded-lg bg-ink-100" />
            <div className="h-4 w-32 rounded-lg bg-ink-100" />
            <div className="h-4 w-20 rounded-lg bg-ink-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              K
            </span>
            <span className="text-lg font-semibold tracking-tight text-ink-900">Klarwerk</span>
          </Link>
          {children}
        </div>
      </div>

      <div className="hidden bg-ink-900 px-12 py-16 lg:flex lg:flex-col lg:justify-center">
        <p className="max-w-md text-2xl font-medium leading-snug text-white">
          „E-Mail kommt rein. Klarwerk versteht sie, bereitet alles vor. Sie bestätigen.“
        </p>
        <ul className="mt-10 space-y-4 text-sm text-ink-300">
          {[
            "Anfragen werden gelesen, eingeordnet und zugeordnet.",
            "Auftrag, Terminvorschlag und Antwortentwurf entstehen automatisch.",
            "Nichts wird ohne Ihre Freigabe versendet.",
            "Jede Aktion ist nachvollziehbar protokolliert.",
          ].map((line) => (
            <li key={line} className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/modules/auth/context";
import { INDUSTRY_OPTIONS } from "@/modules/industry/profiles";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Registrieren" };


export default async function RegisterPage() {
  const context = await getAuthContext();
  if (context) redirect("/dashboard");

  return (
    <>
      <h1 className="text-xl font-semibold text-ink-900">Betrieb anlegen</h1>
      <p className="mt-1 text-sm text-ink-500">In wenigen Minuten einsatzbereit.</p>
      <RegisterForm industries={INDUSTRY_OPTIONS} />
      <p className="mt-6 text-sm text-ink-500">
        Sie haben bereits ein Konto?{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Anmelden
        </Link>
      </p>
    </>
  );
}

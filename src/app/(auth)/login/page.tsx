import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/modules/auth/context";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden" };


export default async function LoginPage() {
  const context = await getAuthContext();
  if (context) redirect(context.tenant.onboardingCompleted ? "/dashboard" : "/onboarding");

  return (
    <>
      <h1 className="text-xl font-semibold text-ink-900">Anmelden</h1>
      <p className="mt-1 text-sm text-ink-500">Willkommen zurück.</p>
      <LoginForm />
      <p className="mt-6 text-sm text-ink-500">
        Noch kein Konto?{" "}
        <Link href="/registrieren" className="font-medium text-brand-700 hover:underline">
          Betrieb anlegen
        </Link>
      </p>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/modules/auth/context";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { INDUSTRY_OPTIONS } from "@/modules/industry/profiles";
import { Card, CardBody } from "@/components/ui";
import { CompanyStep, HoursStep, IndustryStep, AutomationStep, MailboxStep, CalendarStep, CrmStep, WelcomeStep } from "./steps";

export const metadata: Metadata = { title: "Einrichtung" };


const STEPS = [
  "Willkommen",
  "Unternehmen",
  "Branche",
  "Arbeitszeiten",
  "E-Mail",
  "Kalender",
  "CRM/ERP",
  "Automatisierung",
];

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const context = await requireAuth();
  if (context.tenant.onboardingCompleted) redirect("/dashboard");

  const params = await searchParams;
  const step = Math.min(Math.max(Number(params.step ?? context.tenant.onboardingStep ?? 1), 1), 8);

  const [hours, integrations] = await Promise.all([
    prisma.businessHour.findMany({ where: { tenantId: context.tenant.id }, orderBy: { weekday: "asc" } }),
    prisma.integration.findMany({ where: { tenantId: context.tenant.id } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">K</span>
        <span className="text-lg font-semibold tracking-tight text-ink-900">Klarwerk</span>
      </div>

      <ol className="mb-8 flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {STEPS.map((label, index) => {
          const number = index + 1;
          const state = number === step ? "current" : number < step ? "done" : "todo";
          return (
            <li key={label} className="flex items-center gap-1.5">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                  state === "current"
                    ? "bg-brand-600 text-white"
                    : state === "done"
                      ? "bg-brand-100 text-brand-700"
                      : "bg-ink-200 text-ink-500"
                }`}
              >
                {number}
              </span>
              <span className={state === "current" ? "font-medium text-ink-900" : "text-ink-500"}>{label}</span>
            </li>
          );
        })}
      </ol>

      <Card>
        <CardBody className="px-6 py-6">
          {step === 1 ? <WelcomeStep companyName={context.tenant.name} /> : null}
          {step === 2 ? (
            <CompanyStep
              tenant={{
                name: context.tenant.name,
                street: context.tenant.street,
                zip: context.tenant.zip,
                city: context.tenant.city,
                phone: context.tenant.phone,
                email: context.tenant.email,
                website: context.tenant.website,
                employeeCount: context.tenant.employeeCount,
              }}
            />
          ) : null}
          {step === 3 ? <IndustryStep industries={INDUSTRY_OPTIONS} current={context.tenant.industryKey} /> : null}
          {step === 4 ? (
            <HoursStep hours={hours.map((entry) => ({ weekday: entry.weekday, startTime: entry.startTime, endTime: entry.endTime, isClosed: entry.isClosed }))} />
          ) : null}
          {step === 5 ? (
            <MailboxStep
              microsoftConfigured={env.microsoft.configured}
              googleConfigured={env.google.configured}
              connected={integrations.filter((entry) => entry.type === "EMAIL").map((entry) => ({ providerKey: entry.providerKey, status: entry.status }))}
            />
          ) : null}
          {step === 6 ? <CalendarStep /> : null}
          {step === 7 ? <CrmStep /> : null}
          {step === 8 ? <AutomationStep current={context.tenant.automationLevel} /> : null}
        </CardBody>
      </Card>

      <p className="mt-4 text-center text-xs text-ink-500">
        Alle Angaben lassen sich später unter{" "}
        <Link href="/einstellungen" className="underline">
          Einstellungen
        </Link>{" "}
        ändern.
      </p>
    </div>
  );
}

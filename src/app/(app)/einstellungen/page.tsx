import type { Metadata } from "next";
import { requireOnboarded } from "@/modules/auth/context";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Einstellungen" };


export default async function GeneralSettingsPage() {
  const context = await requireOnboarded();
  const settings = context.tenant.settings;

  return (
    <Card>
      <CardHeader
        title="Arbeitsweise von Klarwerk"
        description="Tonfall, Selbstständigkeit und Schwellenwerte, ab denen eine Person prüfen muss."
      />
      <CardBody>
        <SettingsForm
          canWrite={context.can("settings:write")}
          initial={{
            emailTone: settings?.emailTone ?? "professional",
            emailSignature: settings?.emailSignature ?? "",
            companyVoice: settings?.companyVoice ?? "",
            automationLevel: context.tenant.automationLevel,
            minConfidenceCustomerMatch: settings?.minConfidenceCustomerMatch ?? 0.85,
            minConfidenceCategory: settings?.minConfidenceCategory ?? 0.75,
            minConfidencePriority: settings?.minConfidencePriority ?? 0.7,
            minConfidenceExtraction: settings?.minConfidenceExtraction ?? 0.7,
            approvalPolicy: (settings?.approvalPolicy as Record<string, string>) ?? { LOW: "auto", MEDIUM: "approve", HIGH: "approve" },
          }}
        />
      </CardBody>
    </Card>
  );
}

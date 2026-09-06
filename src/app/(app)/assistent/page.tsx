import type { Metadata } from "next";
import { requireOnboarded } from "@/modules/auth/context";
import { getAIStatus } from "@/modules/ai/service";
import { availableToolSchemas } from "@/modules/ai/tools";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { Chat } from "./chat";

export const metadata: Metadata = { title: "AI-Assistent" };


export default async function AssistantPage() {
  const context = await requireOnboarded();
  context.assert("ai:use");

  const [status, tools] = await Promise.all([
    getAIStatus(context.tenant.id),
    availableToolSchemas(context.tenant.id, context.permissions),
  ]);

  return (
    <>
      <PageHeader
        title="AI-Assistent"
        description="Stellen Sie Fragen zu Ihren Kunden, Aufträgen, Terminen und Nachrichten – in normaler Sprache."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Chat isDemo={status.isDemo} demoMessage={status.message} />
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Beispiele" />
            <CardBody className="space-y-2 text-sm text-ink-600">
              {[
                "Welche Aufträge sind diese Woche noch offen?",
                "Welche Kunden warten seit mehr als drei Tagen auf eine Antwort?",
                "Zeig mir alle dringenden Anfragen.",
                "Welche Termine sind morgen frei?",
              ].map((example) => (
                <p key={example}>„{example}"</p>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Worauf der Assistent zugreifen darf"
              description="Nur auf Daten Ihres Betriebs und nur im Rahmen Ihrer Rolle."
            />
            <CardBody className="space-y-1 text-sm text-ink-600">
              {tools.map((tool) => (
                <p key={tool.name}>• {tool.description}</p>
              ))}
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}

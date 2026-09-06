import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { tenantDb } from "@/lib/tenant-db";
import { runWorkflowsForEmail } from "@/modules/workflows/engine";
import { approve, reject } from "@/modules/approvals";
import { createTestEmployee, createTestTenant, dropTenant } from "./helpers";

/** Deckt den Ablauf aus §41 vollständig ab: E-Mail → Analyse → Vorschlag → Freigabe → Ausführung. */
describe("Ende-zu-Ende-Ablauf einer Kundenanfrage", () => {
  let tenantId: string;
  let ownerId: string;
  let ownerPermissions: string[];
  let emailId: string;

  beforeAll(async () => {
    const setup = await createTestTenant();
    tenantId = setup.tenant.id;
    ownerId = setup.owner.id;
    ownerPermissions = setup.ownerPermissions;

    await createTestEmployee(tenantId);
    await prisma.integration.create({
      data: {
        tenantId,
        providerKey: "demo",
        type: "EMAIL",
        status: "CONNECTED",
        accountEmail: "info@test.local",
        displayName: "Demo-Postfach",
        scopes: [],
      },
    });

    const email = await tenantDb(tenantId).email.create({
      data: {
        tenantId,
        externalId: `test-${Date.now()}`,
        direction: "INBOUND",
        status: "RECEIVED",
        fromName: "Max Mustermann",
        fromEmail: "max@example.de",
        toEmails: ["info@test.local"],
        ccEmails: [],
        subject: "Heizung funktioniert nicht mehr",
        bodyText:
          "Hallo,\n\nunsere Heizung funktioniert seit gestern nicht mehr. Wir wohnen in der Hauptstraße 15 in 40210 Düsseldorf und brauchen möglichst schnell Hilfe.\n\nAm Donnerstag Nachmittag wären wir zu Hause.\n\nViele Grüße\nMax Mustermann\nTel. 0170 1234567",
        receivedAt: new Date(),
      },
    });
    emailId = email.id;
  });

  afterAll(async () => {
    await dropTenant(tenantId);
  });

  it("verarbeitet die Nachricht und fordert eine Freigabe an", async () => {
    await runWorkflowsForEmail(tenantId, emailId);

    const email = await tenantDb(tenantId).email.findFirstOrThrow({ where: { id: emailId } });
    expect(email.status).toBe("NEEDS_APPROVAL");
    expect(email.categoryKey).toBe("new_request");
    expect(email.priority).toBe("HIGH");
  });

  it("bereitet Auftrag, Termin und Antwort vor, führt sie aber nicht aus", async () => {
    const approval = await tenantDb(tenantId).approvalRequest.findFirstOrThrow({
      where: { sourceId: emailId },
      orderBy: { createdAt: "desc" },
    });
    const actions = (approval.proposedActions as Array<{ actionKey: string; riskLevel: string }>) ?? [];

    expect(actions.map((action) => action.actionKey)).toEqual(
      expect.arrayContaining(["create_order", "create_appointment", "draft_email", "send_email"]),
    );
    expect(actions.find((action) => action.actionKey === "send_email")?.riskLevel).toBe("HIGH");

    expect(await tenantDb(tenantId).order.count()).toBe(0);
    expect(await tenantDb(tenantId).appointment.count()).toBe(0);
  });

  it("erkennt die Adresse und schlägt einen Termin am Wunschtag vor", async () => {
    const approval = await tenantDb(tenantId).approvalRequest.findFirstOrThrow({ where: { sourceId: emailId } });
    const context = approval.context as Record<string, any>;

    expect(context.extraction.street).toContain("Hauptstraße 15");
    expect(context.extraction.zip).toBe("40210");
    expect(context.slot).not.toBeNull();
    expect(new Date(context.slot.start).getDay()).toBe(4); // Donnerstag
    expect(context.reply.body).toContain("Hallo");
  });

  it("führt nach der Freigabe alle ausgewählten Schritte aus", async () => {
    const approval = await tenantDb(tenantId).approvalRequest.findFirstOrThrow({ where: { sourceId: emailId } });
    const actions = approval.proposedActions as Array<{ id: string; actionKey: string }>;
    const withoutSend = actions.filter((action) => action.actionKey !== "send_email").map((action) => action.id);

    const outcome = await approve(
      tenantId,
      approval.id,
      { userId: ownerId, label: "Test Inhaber", permissions: ownerPermissions },
      { enabledActionIds: withoutSend },
    );

    expect(outcome.results.every((result) => result.ok)).toBe(true);
    expect(outcome.approval.status).toBe("EXECUTED");

    const order = await tenantDb(tenantId).order.findFirstOrThrow({});
    const appointment = await tenantDb(tenantId).appointment.findFirstOrThrow({});
    const draft = await tenantDb(tenantId).email.findFirstOrThrow({ where: { direction: "OUTBOUND" } });

    expect(order.priority).toBe("HIGH");
    expect(order.createdByAI).toBe(true);
    // Der Termin hängt am zuvor erzeugten Auftrag ($ref-Auflösung).
    expect(appointment.orderId).toBe(order.id);
    expect(draft.status).toBe("DRAFT");
    expect(draft.toEmails).toContain("max@example.de");
  });

  it("markiert die E-Mail als verarbeitet und schreibt das Protokoll", async () => {
    const email = await tenantDb(tenantId).email.findFirstOrThrow({ where: { id: emailId } });
    expect(email.status).toBe("PROCESSED");

    const audit = await prisma.auditLog.findMany({ where: { tenantId }, orderBy: { at: "asc" } });
    const actions = audit.map((entry) => entry.action);
    expect(actions).toContain("approval_requested");
    expect(actions).toContain("approval_approved");
    expect(actions).toContain("create_order");

    const approvalEntry = audit.find((entry) => entry.action === "approval_approved");
    expect(approvalEntry?.approvedByLabel).toBe("Test Inhaber");
  });

  it("ordnet eine Nachricht nur einmal ein, auch wenn mehrere Automationen anspringen", async () => {
    const email = await tenantDb(tenantId).email.create({
      data: {
        tenantId,
        externalId: `doppelt-${Date.now()}`,
        direction: "INBOUND",
        status: "RECEIVED",
        fromName: "Petra Klein",
        fromEmail: "petra@example.de",
        toEmails: ["info@test.local"],
        ccEmails: [],
        subject: "Reklamation – Wasserschaden Nacharbeit",
        bodyText:
          "Sehr geehrte Damen und Herren,\n\nnach der Reparatur letzte Woche tropft es an der gleichen Stelle wieder. Bitte kommen Sie kurzfristig zur Nachbesserung.\n\nMit freundlichen Grüßen\nPetra Klein",
        receivedAt: new Date(),
      },
    });

    const contexts = await runWorkflowsForEmail(tenantId, email.id);

    // Beide Automationen auf EMAIL_RECEIVED laufen …
    expect(contexts.length).toBeGreaterThanOrEqual(2);
    // … und jede kennt die Einordnung, denn sie steuert die Bedingung.
    for (const context of contexts) {
      expect(context.classification?.categoryKey).toBeTruthy();
    }

    // … aber das Modell wurde dafür nur einmal befragt.
    const einordnungen = await prisma.aIExecution.count({
      where: { tenantId, entityId: email.id, taskKey: "email_classify" },
    });
    expect(einordnungen).toBe(1);

    // Der übernommene Lauf weist das im Protokoll aus, statt es zu verschweigen.
    const uebernommen = contexts.some((context) =>
      context.activity.some((entry) => entry.message.includes("übernommen aus dem vorherigen Lauf")),
    );
    expect(uebernommen).toBe(true);
  });

  it("bricht ab, wenn die Nachricht nicht in die Bedingung passt", async () => {
    const spam = await tenantDb(tenantId).email.create({
      data: {
        tenantId,
        externalId: `spam-${Date.now()}`,
        direction: "INBOUND",
        status: "RECEIVED",
        fromName: "SEO Agentur",
        fromEmail: "spam@example.biz",
        toEmails: ["info@test.local"],
        ccEmails: [],
        subject: "Mehr Kunden!",
        bodyText: "Garantierte Backlinks für Ihre Website. Newsletter abbestellen: unsubscribe. Werbung.",
        receivedAt: new Date(),
      },
    });

    const contexts = await runWorkflowsForEmail(tenantId, spam.id);
    const intake = contexts[0];
    expect(intake.classification?.categoryKey).toBe("spam");
    expect(intake.stopped).toBeTruthy();
    expect(intake.proposed).toHaveLength(0);
  });

  it("lehnt einen Vorschlag ab, ohne etwas auszuführen", async () => {
    const email = await tenantDb(tenantId).email.create({
      data: {
        tenantId,
        externalId: `reject-${Date.now()}`,
        direction: "INBOUND",
        status: "RECEIVED",
        fromName: "Testkunde",
        fromEmail: "kunde@example.de",
        toEmails: ["info@test.local"],
        ccEmails: [],
        subject: "Abfluss verstopft",
        bodyText: "Guten Tag, unser Abfluss in der Küche ist verstopft, das Wasser läuft nicht ab. Rosenweg 3, 40210 Düsseldorf.",
        receivedAt: new Date(),
      },
    });

    await runWorkflowsForEmail(tenantId, email.id);
    const approval = await tenantDb(tenantId).approvalRequest.findFirstOrThrow({ where: { sourceId: email.id } });
    const ordersBefore = await tenantDb(tenantId).order.count();

    const rejected = await reject(tenantId, approval.id, {
      userId: ownerId,
      label: "Test Inhaber",
      permissions: ownerPermissions,
    }, "Kunde hat telefonisch abgesagt.");

    expect(rejected.status).toBe("REJECTED");
    expect(await tenantDb(tenantId).order.count()).toBe(ordersBefore);

    const updated = await tenantDb(tenantId).email.findFirstOrThrow({ where: { id: email.id } });
    expect(updated.status).toBe("HANDLED");
  });
});

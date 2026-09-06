import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { tenantDb } from "@/lib/tenant-db";
import { AppError } from "@/lib/errors";
import { sendDraft } from "@/modules/email/service";
import { createTestTenant, dropTenant } from "./helpers";

describe("E-Mail-Versand", () => {
  let tenantId: string;
  let draftId: string;

  beforeAll(async () => {
    const setup = await createTestTenant();
    tenantId = setup.tenant.id;

    const draft = await tenantDb(tenantId).email.create({
      data: {
        tenantId,
        direction: "OUTBOUND",
        status: "DRAFT",
        fromEmail: "info@test.local",
        toEmails: ["kunde@example.de"],
        ccEmails: [],
        subject: "Ihr Termin",
        bodyText: "Guten Tag, wir schlagen Ihnen Donnerstag vor.",
      },
    });
    draftId = draft.id;
  });

  afterAll(async () => {
    await dropTenant(tenantId);
  });

  it("schlägt ohne verbundenes Postfach fehl, statt einen Versand vorzutäuschen", async () => {
    await expect(sendDraft(tenantId, draftId)).rejects.toBeInstanceOf(AppError);

    const draft = await tenantDb(tenantId).email.findFirstOrThrow({ where: { id: draftId } });
    expect(draft.status).toBe("DRAFT");
    expect(draft.sentAt).toBeNull();
  });

  it("weist beim Demo-Postfach ausdrücklich aus, dass nichts zugestellt wurde", async () => {
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

    const sent = await sendDraft(tenantId, draftId);
    expect(sent.status).toBe("SENT");
    expect(sent.processingError).toContain("nicht an einen Mailserver");
  });
});

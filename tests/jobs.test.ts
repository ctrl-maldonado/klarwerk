import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { enqueue, registerJob, runDueJobs } from "@/modules/jobs/queue";

describe("Hintergrundaufträge", () => {
  let attempts = 0;

  registerJob("test.ok", async () => {
    attempts += 1;
  });
  registerJob("test.fail", async () => {
    attempts += 1;
    throw new Error("absichtlich fehlgeschlagen");
  });

  beforeEach(async () => {
    attempts = 0;
    await prisma.job.deleteMany({ where: { key: { startsWith: "test." } } });
  });

  afterAll(async () => {
    await prisma.job.deleteMany({ where: { key: { startsWith: "test." } } });
  });

  it("arbeitet fällige Aufträge ab", async () => {
    await enqueue({ key: "test.ok", payload: { value: 1 } });
    const result = await runDueJobs(5);

    expect(result.processed).toBe(1);
    expect(attempts).toBe(1);

    const job = await prisma.job.findFirstOrThrow({ where: { key: "test.ok" } });
    expect(job.status).toBe("COMPLETED");
  });

  it("legt denselben Auftrag bei gleichem Idempotenzschlüssel nur einmal an", async () => {
    await enqueue({ key: "test.ok", idempotencyKey: "einmalig" });
    await enqueue({ key: "test.ok", idempotencyKey: "einmalig" });

    const count = await prisma.job.count({ where: { key: "test.ok" } });
    expect(count).toBe(1);
    await prisma.job.deleteMany({ where: { idempotencyKey: "einmalig" } });
  });

  it("wiederholt fehlgeschlagene Aufträge mit wachsendem Abstand", async () => {
    await enqueue({ key: "test.fail", maxAttempts: 3 });
    const result = await runDueJobs(5);

    expect(result.failed).toBe(1);
    const job = await prisma.job.findFirstOrThrow({ where: { key: "test.fail" } });
    expect(job.status).toBe("PENDING");
    expect(job.attempts).toBe(1);
    expect(job.runAt.getTime()).toBeGreaterThan(Date.now());
    expect(job.lastError).toContain("absichtlich fehlgeschlagen");
  });

  it("gibt nach der letzten Wiederholung auf und macht den Fehler sichtbar", async () => {
    await enqueue({ key: "test.fail", maxAttempts: 1 });
    await runDueJobs(5);

    const job = await prisma.job.findFirstOrThrow({ where: { key: "test.fail" } });
    expect(job.status).toBe("DEAD");
    expect(job.lastError).toBeTruthy();
    expect(job.finishedAt).not.toBeNull();
  });

  it("meldet fehlende Handler statt still zu scheitern", async () => {
    await enqueue({ key: "test.unbekannt" });
    await runDueJobs(5);

    const job = await prisma.job.findFirstOrThrow({ where: { key: "test.unbekannt" } });
    expect(job.status).toBe("DEAD");
    expect(job.lastError).toContain("Kein Handler");
  });
});

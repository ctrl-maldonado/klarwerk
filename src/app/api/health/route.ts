import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, string> = {};
  let healthy = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch (error) {
    checks.database = error instanceof Error ? error.message : "fehler";
    healthy = false;
  }

  checks.aiProvider =
    process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY ? "configured" : "demo";
  checks.storage = process.env.S3_BUCKET ? "s3" : "local";

  return NextResponse.json({ status: healthy ? "ok" : "degraded", checks, at: new Date().toISOString() }, { status: healthy ? 200 : 503 });
}

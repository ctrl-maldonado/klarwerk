import type { Document } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { tenantDb } from "@/lib/tenant-db";
import { runAITask } from "@/modules/ai/service";
import { writeAudit } from "@/modules/audit";
import { recordUsage } from "@/modules/billing/usage";
import { getStorage } from "./storage";

const log = logger.child({ module: "documents" });

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
];

/** Extrahiert Text, soweit das Format es zulässt. Gibt sonst null zurück – ohne zu raten. */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<{ text: string | null; note?: string }> {
  try {
    if (mimeType.startsWith("text/") || filename.endsWith(".txt") || filename.endsWith(".csv")) {
      return { text: buffer.toString("utf8").slice(0, 100_000) };
    }
    if (mimeType === "application/pdf" || filename.endsWith(".pdf")) {
      const { default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js");
      const parsed = await pdfParse(buffer);
      const text = parsed.text?.trim() ?? "";
      return text
        ? { text: text.slice(0, 100_000) }
        : { text: null, note: "Das PDF enthält keinen auslesbaren Text (vermutlich ein Scan). Eine Texterkennung ist nicht eingerichtet." };
    }
    if (filename.endsWith(".docx") || mimeType.includes("wordprocessingml")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value.slice(0, 100_000) };
    }
    if (mimeType.startsWith("image/")) {
      return { text: null, note: "Bilder werden gespeichert, aber nicht automatisch ausgelesen." };
    }
    return { text: null, note: `Für den Dateityp ${mimeType} ist keine Textextraktion eingerichtet.` };
  } catch (error) {
    log.warn("document.extract.failed", { filename, mimeType, error: (error as Error).message });
    return { text: null, note: `Der Text konnte nicht gelesen werden: ${(error as Error).message}` };
  }
}

export interface UploadInput {
  tenantId: string;
  file: { name: string; type: string; size: number; buffer: Buffer };
  customerId?: string | null;
  orderId?: string | null;
  uploadedById: string;
  actorLabel: string;
  analyze?: boolean;
}

export async function uploadDocument(input: UploadInput): Promise<Document> {
  if (input.file.size > MAX_UPLOAD_BYTES) {
    throw new AppError(`Die Datei ist größer als ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`, 413, "file_too_large");
  }
  if (!ALLOWED_MIME_TYPES.includes(input.file.type)) {
    throw new AppError(`Dateien vom Typ ${input.file.type || "unbekannt"} sind nicht zugelassen.`, 415, "unsupported_type");
  }

  const db = tenantDb(input.tenantId);
  const storage = getStorage();
  const storageKey = await storage.put(input.tenantId, input.file.name, input.file.buffer, input.file.type);
  const extraction = await extractText(input.file.buffer, input.file.type, input.file.name);

  let aiExtraction: Record<string, unknown> | null = null;
  let aiConfidence: number | null = null;

  if (input.analyze !== false && extraction.text) {
    try {
      const outcome = await runAITask<Record<string, unknown>>({
        tenantId: input.tenantId,
        promptKey: "document_extractor",
        entityType: "document",
        variables: { filename: input.file.name, mimeType: input.file.type, content: extraction.text.slice(0, 12_000) },
        context: { filename: input.file.name, content: extraction.text.slice(0, 12_000) },
      });
      aiExtraction = outcome.data ?? null;
      aiConfidence = outcome.confidence;
    } catch (error) {
      aiExtraction = { error: `Die Auswertung ist fehlgeschlagen: ${(error as Error).message}` };
    }
  } else if (extraction.note) {
    aiExtraction = { note: extraction.note };
  }

  const document = await db.document.create({
    data: {
      tenantId: input.tenantId,
      filename: input.file.name,
      mimeType: input.file.type,
      size: input.file.size,
      storageKey,
      source: "UPLOAD",
      customerId: input.customerId || null,
      orderId: input.orderId || null,
      uploadedById: input.uploadedById,
      extractedText: extraction.text,
      ...(aiExtraction ? { aiExtraction: aiExtraction as object } : {}),
      aiConfidence,
    },
  });

  await recordUsage(input.tenantId, "documents", 1, { documentId: document.id });
  await writeAudit({
    tenantId: input.tenantId,
    actorType: "USER",
    actorUserId: input.uploadedById,
    actorLabel: input.actorLabel,
    action: "document_uploaded",
    entityType: "document",
    entityId: document.id,
    details: { filename: document.filename, size: document.size },
  });

  return document;
}

export async function readDocument(tenantId: string, documentId: string): Promise<{ document: Document; data: Buffer }> {
  const document = await tenantDb(tenantId).document.findFirst({ where: { id: documentId } });
  if (!document) throw new AppError("Dokument nicht gefunden.", 404, "not_found");
  return { document, data: await getStorage().get(document.storageKey) };
}

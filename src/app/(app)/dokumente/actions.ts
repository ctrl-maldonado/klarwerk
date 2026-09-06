"use server";

import { revalidatePath } from "next/cache";
import { requireAuthApi } from "@/modules/auth/context";
import { uploadDocument } from "@/modules/documents/service";

export interface UploadState {
  error?: string;
  success?: string;
}

export async function uploadDocumentAction(_prev: UploadState, formData: FormData): Promise<UploadState> {
  try {
    const context = await requireAuthApi();
    context.assert("documents:write");

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Bitte eine Datei auswählen." };

    const customerId = String(formData.get("customerId") ?? "") || null;
    const orderId = String(formData.get("orderId") ?? "") || null;

    const document = await uploadDocument({
      tenantId: context.tenant.id,
      file: {
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        buffer: Buffer.from(await file.arrayBuffer()),
      },
      customerId,
      orderId,
      uploadedById: context.user.id,
      actorLabel: context.user.name,
    });

    revalidatePath("/dokumente");
    // Anhänge werden auch am Auftrag und beim Kunden angezeigt.
    if (orderId) revalidatePath(`/auftraege/${orderId}`);
    if (customerId) revalidatePath(`/kunden/${customerId}`);
    return { success: `„${document.filename}" wurde hochgeladen und ausgewertet.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Upload fehlgeschlagen." };
  }
}

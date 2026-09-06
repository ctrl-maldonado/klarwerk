import { NextResponse } from "next/server";
import { requireAuthApi } from "@/modules/auth/context";
import { readDocument } from "@/modules/documents/service";
import { apiError } from "@/modules/api/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAuthApi();
    context.assert("documents:read");
    const { id } = await params;
    const { document, data } = await readDocument(context.tenant.id, id);

    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(document.filename)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

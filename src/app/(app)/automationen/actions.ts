"use server";

import { revalidatePath } from "next/cache";
import { requireAuthApi } from "@/modules/auth/context";
import { tenantDb } from "@/lib/tenant-db";
import { writeAudit } from "@/modules/audit";

export async function toggleWorkflowAction(formData: FormData): Promise<void> {
  const context = await requireAuthApi();
  context.assert("workflows:write");

  const workflowId = String(formData.get("workflowId"));
  const db = tenantDb(context.tenant.id);
  const workflow = await db.workflow.findFirst({ where: { id: workflowId } });
  if (!workflow) return;

  await db.workflow.update({ where: { id: workflowId }, data: { isActive: !workflow.isActive } });
  await writeAudit({
    tenantId: context.tenant.id,
    actorType: "USER",
    actorUserId: context.user.id,
    actorLabel: context.user.name,
    action: workflow.isActive ? "workflow_disabled" : "workflow_enabled",
    entityType: "workflow",
    entityId: workflowId,
    details: { key: workflow.key },
  });
  revalidatePath("/automationen");
}

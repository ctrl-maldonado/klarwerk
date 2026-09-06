import type { NotificationLevel } from "@prisma/client";
import { tenantDb } from "@/lib/tenant-db";

export interface NotificationInput {
  tenantId: string;
  userId?: string | null;
  type: string;
  title: string;
  body?: string;
  level?: NotificationLevel;
  link?: string;
}

/** In-App-Benachrichtigungen (§27). E-Mail-Versand hängt an denselben Einträgen. */
export async function notify(input: NotificationInput) {
  return tenantDb(input.tenantId).notification.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? "",
      level: input.level ?? "INFO",
      link: input.link ?? null,
    },
  });
}

export async function listNotifications(tenantId: string, userId: string, limit = 20) {
  return tenantDb(tenantId).notification.findMany({
    where: { OR: [{ userId }, { userId: null }] },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function countUnread(tenantId: string, userId: string): Promise<number> {
  return tenantDb(tenantId).notification.count({
    where: { readAt: null, OR: [{ userId }, { userId: null }] },
  });
}

export async function markAllRead(tenantId: string, userId: string) {
  await tenantDb(tenantId).notification.updateMany({
    where: { readAt: null, OR: [{ userId }, { userId: null }] },
    data: { readAt: new Date() },
  });
}

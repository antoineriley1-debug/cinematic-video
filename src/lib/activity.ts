import type { Db } from "./db";

// Everything meaningful contributes to the executive activity calendar.
export async function recordActivity(
  db: Db,
  entry: {
    userId: string;
    type: string;
    summary: string;
    entityType?: string;
    entityId?: string;
    occurredAt?: Date;
  },
): Promise<void> {
  await db.activityEvent.create({
    data: {
      userId: entry.userId,
      type: entry.type,
      summary: entry.summary,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      occurredAt: entry.occurredAt ?? new Date(),
    },
  });
}

export async function activityBetween(db: Db, userId: string, from: Date, to: Date) {
  return db.activityEvent.findMany({
    where: { userId, occurredAt: { gte: from, lte: to } },
    orderBy: { occurredAt: "asc" },
  });
}

import type { Db } from "./db";

export async function audit(
  db: Db,
  entry: {
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    source?: "UI" | "API" | "SYSTEM" | "AI";
    requestId?: string;
  },
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before === undefined ? null : JSON.stringify(entry.before),
      after: entry.after === undefined ? null : JSON.stringify(entry.after),
      source: entry.source ?? "UI",
      requestId: entry.requestId ?? null,
    },
  });
}

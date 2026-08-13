// Action & deadline edits. Every change is audited so the record of what an
// action said — and when it changed — survives the edit.
import type { Db } from "../db";
import { audit } from "../audit";
import { recordActivity } from "../activity";

export type ActionItemEdits = {
  title?: string;
  details?: string | null;
  kind?: "ACTION" | "DEADLINE";
  siteId?: string | null;
  ownerId?: string | null;
  dueDate?: Date | null;
  status?: "OPEN" | "DONE" | "CANCELLED";
};

export async function updateActionItem(db: Db, actor: { id: string }, id: string, edits: ActionItemEdits) {
  const before = await db.actionItem.findUniqueOrThrow({ where: { id } });
  const data: Record<string, unknown> = {};
  if (edits.title !== undefined && edits.title.trim()) data.title = edits.title.trim();
  if (edits.details !== undefined) data.details = edits.details || null;
  if (edits.kind !== undefined) data.kind = edits.kind;
  if (edits.siteId !== undefined) data.siteId = edits.siteId || null;
  if (edits.ownerId !== undefined) data.ownerId = edits.ownerId || null;
  if (edits.dueDate !== undefined) data.dueDate = edits.dueDate;
  if (edits.status !== undefined) {
    data.status = edits.status;
    // Reopening clears the completion stamp; completing sets it.
    data.completedAt = edits.status === "DONE" ? (before.completedAt ?? new Date()) : null;
  }
  const after = await db.actionItem.update({ where: { id }, data });
  await audit(db, {
    actorId: actor.id,
    action: "ACTION_UPDATED",
    entityType: "ACTION",
    entityId: id,
    before: { title: before.title, kind: before.kind, status: before.status, dueDate: before.dueDate, siteId: before.siteId },
    after: { title: after.title, kind: after.kind, status: after.status, dueDate: after.dueDate, siteId: after.siteId },
  });
  await recordActivity(db, {
    userId: actor.id,
    type: after.status === "DONE" && before.status !== "DONE" ? "ACTION_COMPLETED" : "ACTION_UPDATED",
    summary: `${after.kind === "DEADLINE" ? "Deadline" : "Action"} updated: ${after.title}`,
    entityType: "ACTION",
    entityId: id,
  });
  return after;
}

/** Delete an action or deadline (its creator or owner, or an admin). */
export async function deleteActionItem(db: Db, actor: { id: string; role: string }, id: string) {
  const item = await db.actionItem.findUniqueOrThrow({ where: { id } });
  if (item.createdById !== actor.id && item.ownerId !== actor.id && actor.role !== "ADMIN")
    throw new Error("Only the creator, the owner, or an admin can delete this item.");
  await db.comment.deleteMany({ where: { entityType: "ACTION", entityId: id } });
  await db.flag.deleteMany({ where: { entityType: "ACTION", entityId: id } });
  await db.link.deleteMany({ where: { OR: [{ fromType: "ACTION", fromId: id }, { toType: "ACTION", toId: id }] } });
  await db.actionItem.delete({ where: { id } });
  await audit(db, {
    actorId: actor.id,
    action: "ACTION_DELETED",
    entityType: "ACTION",
    entityId: id,
    before: { title: item.title, kind: item.kind, status: item.status },
  });
  return item;
}

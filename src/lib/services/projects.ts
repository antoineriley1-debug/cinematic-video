// Project lifecycle operations that need permission checks and cleanup.
import type { Db } from "../db";
import { audit } from "../audit";
import { recordActivity } from "../activity";

export type ProjectEdits = {
  name?: string;
  description?: string | null;
  siteId?: string | null;
  status?: string;
  priority?: string;
  dueDate?: Date | null;
};

/** Edit a project. Any executive may edit; the change is audited before/after. */
export async function updateProject(db: Db, actor: { id: string }, projectId: string, edits: ProjectEdits) {
  const before = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const data: ProjectEdits = {};
  if (edits.name !== undefined && edits.name.trim()) data.name = edits.name.trim();
  if (edits.description !== undefined) data.description = edits.description || null;
  if (edits.siteId !== undefined) data.siteId = edits.siteId || null;
  if (edits.status !== undefined) data.status = edits.status;
  if (edits.priority !== undefined) data.priority = edits.priority;
  if (edits.dueDate !== undefined) data.dueDate = edits.dueDate;
  const after = await db.project.update({ where: { id: projectId }, data });
  await audit(db, {
    actorId: actor.id,
    action: "PROJECT_UPDATED",
    entityType: "PROJECT",
    entityId: projectId,
    before: { name: before.name, status: before.status, priority: before.priority, dueDate: before.dueDate, siteId: before.siteId },
    after: { name: after.name, status: after.status, priority: after.priority, dueDate: after.dueDate, siteId: after.siteId },
  });
  await recordActivity(db, {
    userId: actor.id,
    type: "PROJECT_UPDATED",
    summary: `Project updated: ${after.name}`,
    entityType: "PROJECT",
    entityId: projectId,
  });
  return after;
}

/**
 * Delete a project (creator or admin only), removing its comments, flags,
 * and cross-module links. The audit trail keeps the record of the deletion.
 */
export async function deleteProject(db: Db, actor: { id: string; role: string }, projectId: string) {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  if (project.createdById !== actor.id && actor.role !== "ADMIN")
    throw new Error("Only the project's creator or an admin can delete it.");
  await db.comment.deleteMany({ where: { entityType: "PROJECT", entityId: projectId } });
  await db.flag.deleteMany({ where: { entityType: "PROJECT", entityId: projectId } });
  await db.link.deleteMany({ where: { OR: [{ fromType: "PROJECT", fromId: projectId }, { toType: "PROJECT", toId: projectId }] } });
  await db.project.delete({ where: { id: projectId } });
  await audit(db, { actorId: actor.id, action: "PROJECT_DELETED", entityType: "PROJECT", entityId: projectId, before: { name: project.name, status: project.status } });
  await recordActivity(db, { userId: actor.id, type: "PROJECT_UPDATED", summary: `Project deleted: ${project.name}`, entityType: "PROJECT", entityId: projectId });
  return project;
}

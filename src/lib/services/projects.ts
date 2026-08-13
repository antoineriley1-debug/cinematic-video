// Project lifecycle operations that need permission checks and cleanup.
import type { Db } from "../db";
import { audit } from "../audit";
import { recordActivity } from "../activity";

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

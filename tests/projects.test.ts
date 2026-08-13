import { describe, expect, it } from "vitest";
import { db, makeUser, makeSite, uniq } from "./helpers";
import { deleteProject } from "@/lib/services/projects";
import { link } from "@/lib/links";

async function makeProject(createdById: string, siteId?: string) {
  return db.project.create({ data: { name: uniq("Project"), createdById, siteId: siteId ?? null } });
}

describe("project deletion", () => {
  it("creator deletes a project and its comments, flags, and links go with it", async () => {
    const user = await makeUser();
    const site = await makeSite();
    const project = await makeProject(user.id, site.id);
    await db.comment.create({ data: { entityType: "PROJECT", entityId: project.id, content: "note", authorId: user.id } });
    await db.flag.create({ data: { userId: user.id, entityType: "PROJECT", entityId: project.id, label: "FOLLOW_UP" } });
    await link(db, { type: "PROJECT", id: project.id }, { type: "SITE", id: site.id }, { createdById: user.id });

    await deleteProject(db, user, project.id);

    expect(await db.project.findUnique({ where: { id: project.id } })).toBeNull();
    expect(await db.comment.count({ where: { entityType: "PROJECT", entityId: project.id } })).toBe(0);
    expect(await db.flag.count({ where: { entityType: "PROJECT", entityId: project.id } })).toBe(0);
    expect(await db.link.count({ where: { fromType: "PROJECT", fromId: project.id } })).toBe(0);
    const auditRow = await db.auditLog.findFirst({ where: { action: "PROJECT_DELETED", entityId: project.id } });
    expect(auditRow?.actorId).toBe(user.id);
  });

  it("admin can delete another user's project", async () => {
    const owner = await makeUser();
    const admin = await makeUser("ADMIN");
    const project = await makeProject(owner.id);
    await deleteProject(db, admin, project.id);
    expect(await db.project.findUnique({ where: { id: project.id } })).toBeNull();
  });

  it("a non-admin who didn't create the project is refused", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const project = await makeProject(owner.id);
    await expect(deleteProject(db, other, project.id)).rejects.toThrow(/creator or an admin/);
    expect(await db.project.findUnique({ where: { id: project.id } })).not.toBeNull();
  });
});

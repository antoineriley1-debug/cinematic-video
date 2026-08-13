import { describe, expect, it } from "vitest";
import { db, makeUser, makeSite, uniq } from "./helpers";
import { updateProject } from "@/lib/services/projects";
import { updateActionItem, deleteActionItem } from "@/lib/services/actionItems";

describe("editing projects", () => {
  it("updates fields, clears the due date, and audits before/after", async () => {
    const user = await makeUser();
    const site = await makeSite();
    const project = await db.project.create({
      data: { name: uniq("Project"), createdById: user.id, priority: "LOW", dueDate: new Date("2026-09-01") },
    });

    const updated = await updateProject(db, user, project.id, {
      name: "Boiler 3 replacement",
      description: "Phase 2",
      siteId: site.id,
      status: "ON_HOLD",
      priority: "HIGH",
      dueDate: null, // blank date clears it
    });

    expect(updated.name).toBe("Boiler 3 replacement");
    expect(updated.siteId).toBe(site.id);
    expect(updated.status).toBe("ON_HOLD");
    expect(updated.priority).toBe("HIGH");
    expect(updated.dueDate).toBeNull();

    const row = await db.auditLog.findFirst({ where: { action: "PROJECT_UPDATED", entityId: project.id }, orderBy: { createdAt: "desc" } });
    expect(row?.before).toContain("LOW");
    expect(row?.after).toContain("HIGH");
  });

  it("ignores a blank name rather than wiping it", async () => {
    const user = await makeUser();
    const project = await db.project.create({ data: { name: "Keep me", createdById: user.id } });
    const updated = await updateProject(db, user, project.id, { name: "   " });
    expect(updated.name).toBe("Keep me");
  });
});

describe("editing actions and deadlines", () => {
  it("edits an action, converts it to a deadline, and reopening clears the completion stamp", async () => {
    const user = await makeUser();
    const item = await db.actionItem.create({
      data: { title: "Follow up", kind: "ACTION", createdById: user.id, ownerId: user.id },
    });

    const edited = await updateActionItem(db, user, item.id, {
      title: "Submit capital request",
      details: "Board packet",
      kind: "DEADLINE",
      dueDate: new Date("2026-10-15"),
    });
    expect(edited.title).toBe("Submit capital request");
    expect(edited.kind).toBe("DEADLINE");
    expect(edited.dueDate?.toISOString().slice(0, 10)).toBe("2026-10-15");

    const completed = await updateActionItem(db, user, item.id, { status: "DONE" });
    expect(completed.completedAt).not.toBeNull();

    const reopened = await updateActionItem(db, user, item.id, { status: "OPEN" });
    expect(reopened.status).toBe("OPEN");
    expect(reopened.completedAt).toBeNull();
  });

  it("deletes an item for its owner but refuses a stranger", async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const admin = await makeUser("ADMIN");

    const mine = await db.actionItem.create({ data: { title: uniq("A"), createdById: owner.id, ownerId: owner.id } });
    await expect(deleteActionItem(db, stranger, mine.id)).rejects.toThrow(/creator, the owner, or an admin/);
    await deleteActionItem(db, owner, mine.id);
    expect(await db.actionItem.findUnique({ where: { id: mine.id } })).toBeNull();

    const other = await db.actionItem.create({ data: { title: uniq("B"), createdById: owner.id } });
    await deleteActionItem(db, admin, other.id); // admin override
    expect(await db.actionItem.findUnique({ where: { id: other.id } })).toBeNull();
  });
});

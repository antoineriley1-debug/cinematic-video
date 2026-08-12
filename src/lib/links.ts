// EVERYTHING CONNECTS — polymorphic relationship service.
// Links are stored once per direction pair and queried from both sides.
import type { Db } from "./db";
import type { EntityType } from "./validate";

export type LinkRef = { type: EntityType; id: string };

export async function link(
  db: Db,
  from: LinkRef,
  to: LinkRef,
  opts?: { kind?: string; confirmed?: boolean; suggestedBy?: "USER" | "AI" | "EMERGENCY"; createdById?: string },
) {
  return db.link.upsert({
    where: {
      fromType_fromId_toType_toId: {
        fromType: from.type,
        fromId: from.id,
        toType: to.type,
        toId: to.id,
      },
    },
    update: opts?.confirmed === true ? { confirmed: true } : {},
    create: {
      fromType: from.type,
      fromId: from.id,
      toType: to.type,
      toId: to.id,
      kind: opts?.kind ?? "RELATED",
      confirmed: opts?.confirmed ?? true,
      suggestedBy: opts?.suggestedBy ?? "USER",
      createdById: opts?.createdById ?? null,
    },
  });
}

export async function confirmLink(db: Db, linkId: string) {
  return db.link.update({ where: { id: linkId }, data: { confirmed: true } });
}

export async function rejectLink(db: Db, linkId: string) {
  return db.link.delete({ where: { id: linkId } });
}

/** All links touching an entity, from either direction. */
export async function linksFor(db: Db, ref: LinkRef, opts?: { confirmedOnly?: boolean }) {
  const where = opts?.confirmedOnly ? { confirmed: true } : {};
  const [out, incoming] = await Promise.all([
    db.link.findMany({ where: { fromType: ref.type, fromId: ref.id, ...where } }),
    db.link.findMany({ where: { toType: ref.type, toId: ref.id, ...where } }),
  ]);
  return [
    ...out.map((l) => ({ link: l, other: { type: l.toType as EntityType, id: l.toId } })),
    ...incoming.map((l) => ({ link: l, other: { type: l.fromType as EntityType, id: l.fromId } })),
  ];
}

/** Pending AI-suggested links awaiting human confirmation for an entity. */
export async function pendingLinksFor(db: Db, ref: LinkRef) {
  const all = await linksFor(db, ref);
  return all.filter((l) => !l.link.confirmed);
}

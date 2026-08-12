// Enterprise search. Permissions are enforced BEFORE retrieval: private
// notes, memories, flags, and private director-file entries are filtered
// by owner in the query itself, never post-hoc in the UI.
import type { Db } from "./db";

export type SearchHit = {
  type: string;
  id: string;
  title: string;
  snippet: string;
  href: string;
  date?: Date;
};

function snip(text: string | null | undefined, q: string, len = 160): string {
  if (!text) return "";
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  const start = Math.max(0, idx - 40);
  return (start > 0 ? "…" : "") + text.slice(start, start + len) + (text.length > start + len ? "…" : "");
}

export async function searchAll(db: Db, userId: string, query: string, limit = 8): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const c = { contains: q };
  const hits: SearchHit[] = [];

  const [sites, directors, vendors, contracts, projects, emails, meetings, plauds, notes, actions, activities, memories] =
    await Promise.all([
      db.site.findMany({ where: { OR: [{ name: c }, { location: c }, { code: c }] }, take: limit }),
      db.director.findMany({ where: { OR: [{ name: c }, { title: c }, { email: c }] }, take: limit }),
      db.vendor.findMany({ where: { OR: [{ name: c }, { category: c }] }, take: limit }),
      db.contract.findMany({ where: { OR: [{ title: c }, { description: c }, { terms: c }] }, take: limit }),
      db.project.findMany({ where: { OR: [{ name: c }, { description: c }] }, take: limit }),
      db.emailMessage.findMany({ where: { OR: [{ subject: c }, { bodyText: c }, { summary: c }, { fromAddress: c }] }, take: limit }),
      db.meeting.findMany({ where: { OR: [{ title: c }, { minutesText: c }, { summary: c }] }, take: limit }),
      db.plaudRecording.findMany({ where: { OR: [{ title: c }, { transcript: c }, { summary: c }] }, take: limit }),
      // Authorization at query level: own notes OR public notes only.
      db.note.findMany({
        where: {
          AND: [
            { OR: [{ title: c }, { content: c }] },
            { OR: [{ authorId: userId }, { visibility: "PUBLIC" }] },
          ],
        },
        take: limit,
      }),
      db.actionItem.findMany({ where: { OR: [{ title: c }, { details: c }] }, take: limit }),
      db.activityEvent.findMany({ where: { userId, summary: c }, take: limit, orderBy: { occurredAt: "desc" } }),
      db.memoryItem.findMany({ where: { ownerId: userId, content: c }, take: limit }),
    ]);

  for (const s of sites) hits.push({ type: "Site", id: s.id, title: s.name, snippet: s.location ?? "", href: `/sites/${s.id}` });
  for (const d of directors) hits.push({ type: "Director", id: d.id, title: d.name, snippet: d.title ?? "", href: `/directors/${d.id}` });
  for (const v of vendors) hits.push({ type: "Vendor", id: v.id, title: v.name, snippet: v.category ?? "", href: `/vendors/${v.id}` });
  for (const ct of contracts) hits.push({ type: "Contract", id: ct.id, title: ct.title, snippet: snip(ct.terms ?? ct.description, q), href: `/contracts/${ct.id}` });
  for (const p of projects) hits.push({ type: "Project", id: p.id, title: p.name, snippet: snip(p.description, q), href: `/projects` });
  for (const e of emails) hits.push({ type: "Email", id: e.id, title: e.subject ?? "(no subject)", snippet: snip(e.summary ?? e.bodyText, q), href: `/emails/${e.id}`, date: e.sentAt ?? e.createdAt });
  for (const m of meetings) hits.push({ type: "Meeting", id: m.id, title: m.title, snippet: snip(m.summary ?? m.minutesText, q), href: `/meetings/${m.id}`, date: m.heldAt ?? m.createdAt });
  for (const p of plauds) hits.push({ type: "Plaud", id: p.id, title: p.title, snippet: snip(p.summary ?? p.transcript, q), href: `/plaud/${p.id}` });
  for (const n of notes) hits.push({ type: n.visibility === "PUBLIC" ? "Public Note" : "Note", id: n.id, title: n.title ?? "(untitled note)", snippet: snip(n.content, q), href: `/notes/${n.id}` });
  for (const a of actions) hits.push({ type: a.kind === "DEADLINE" ? "Deadline" : "Action", id: a.id, title: a.title, snippet: snip(a.details, q), href: `/actions`, date: a.dueDate ?? undefined });
  for (const ev of activities) hits.push({ type: "Activity", id: ev.id, title: ev.summary, snippet: ev.type, href: `/calendar`, date: ev.occurredAt });
  for (const mm of memories) hits.push({ type: "Memory", id: mm.id, title: snip(mm.content, q, 60), snippet: mm.category, href: `/memory` });

  return hits;
}

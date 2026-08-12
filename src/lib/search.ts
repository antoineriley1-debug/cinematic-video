// Enterprise search. Permissions are enforced BEFORE retrieval: private
// notes, memories, flags, and private director-file entries are filtered
// by owner in the query itself, never post-hoc in the UI.
// Natural-language queries: multi-word input matches records containing ANY
// meaningful term, ranked by how many distinct terms each hit contains
// (exact-phrase matches rank highest).
import type { Db } from "./db";

export type SearchHit = {
  type: string;
  id: string;
  title: string;
  snippet: string;
  href: string;
  date?: Date;
  score?: number;
};

const STOP = new Set(["the", "a", "an", "and", "or", "for", "with", "about", "what", "show", "all", "any", "have", "has", "this", "that"]);

export function searchTerms(query: string): string[] {
  return [...new Set(
    query.toLowerCase().replace(/[^\w\s'&-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)),
  )];
}

function snip(text: string | null | undefined, q: string, len = 160): string {
  if (!text) return "";
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  const start = Math.max(0, idx - 40);
  return (start > 0 ? "…" : "") + text.slice(start, start + len) + (text.length > start + len ? "…" : "");
}

export async function searchAll(db: Db, userId: string, query: string, limit = 8): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const terms = searchTerms(q);
  const needles = terms.length > 0 ? [...new Set([q, ...terms])] : [q];

  // OR of (field contains needle) across the phrase and every term.
  const match = (...fields: string[]) => ({
    OR: needles.flatMap((n) => fields.map((f) => ({ [f]: { contains: n } }))),
  });
  const fetchLimit = limit * 2;

  const [sites, directors, vendors, contracts, projects, emails, meetings, plauds, notes, actions, activities, memories] =
    await Promise.all([
      db.site.findMany({ where: match("name", "location", "code"), take: fetchLimit }),
      db.director.findMany({ where: match("name", "title", "email"), take: fetchLimit }),
      db.vendor.findMany({ where: match("name", "category"), take: fetchLimit }),
      db.contract.findMany({ where: match("title", "description", "terms"), take: fetchLimit }),
      db.project.findMany({ where: match("name", "description"), take: fetchLimit }),
      db.emailMessage.findMany({ where: match("subject", "bodyText", "summary", "fromAddress"), take: fetchLimit }),
      db.meeting.findMany({ where: match("title", "minutesText", "summary"), take: fetchLimit }),
      db.plaudRecording.findMany({ where: match("title", "transcript", "summary"), take: fetchLimit }),
      // Authorization at query level: own notes OR public notes only.
      db.note.findMany({
        where: { AND: [match("title", "content"), { OR: [{ authorId: userId }, { visibility: "PUBLIC" }] }] },
        take: fetchLimit,
      }),
      db.actionItem.findMany({ where: match("title", "details"), take: fetchLimit }),
      db.activityEvent.findMany({ where: { AND: [{ userId }, match("summary")] }, take: fetchLimit, orderBy: { occurredAt: "desc" } }),
      db.memoryItem.findMany({ where: { AND: [{ ownerId: userId }, match("content")] }, take: fetchLimit }),
    ]);

  const hits: SearchHit[] = [];
  for (const s of sites) hits.push({ type: "Site", id: s.id, title: s.name, snippet: s.location ?? "", href: `/sites/${s.id}` });
  for (const d of directors) hits.push({ type: "Director", id: d.id, title: d.name, snippet: d.title ?? "", href: `/directors/${d.id}` });
  for (const v of vendors) hits.push({ type: "Vendor", id: v.id, title: v.name, snippet: v.category ?? "", href: `/vendors/${v.id}` });
  for (const ct of contracts) hits.push({ type: "Contract", id: ct.id, title: ct.title, snippet: snip(ct.terms ?? ct.description, terms[0] ?? q), href: `/contracts/${ct.id}` });
  for (const p of projects) hits.push({ type: "Project", id: p.id, title: p.name, snippet: snip(p.description, terms[0] ?? q), href: `/projects` });
  for (const e of emails) hits.push({ type: "Email", id: e.id, title: e.subject ?? "(no subject)", snippet: snip(e.summary ?? e.bodyText, terms[0] ?? q), href: `/emails/${e.id}`, date: e.sentAt ?? e.createdAt });
  for (const m of meetings) hits.push({ type: "Meeting", id: m.id, title: m.title, snippet: snip(m.summary ?? m.minutesText, terms[0] ?? q), href: `/meetings/${m.id}`, date: m.heldAt ?? m.createdAt });
  for (const p of plauds) hits.push({ type: "Plaud", id: p.id, title: p.title, snippet: snip(p.summary ?? p.transcript, terms[0] ?? q), href: `/plaud/${p.id}` });
  for (const n of notes) hits.push({ type: n.visibility === "PUBLIC" ? "Public Note" : "Note", id: n.id, title: n.title ?? "(untitled note)", snippet: snip(n.content, terms[0] ?? q), href: `/notes/${n.id}` });
  for (const a of actions) hits.push({ type: a.kind === "DEADLINE" ? "Deadline" : "Action", id: a.id, title: a.title, snippet: snip(a.details, terms[0] ?? q), href: `/actions`, date: a.dueDate ?? undefined });
  for (const ev of activities) hits.push({ type: "Activity", id: ev.id, title: ev.summary, snippet: ev.type, href: `/calendar`, date: ev.occurredAt });
  for (const mm of memories) hits.push({ type: "Memory", id: mm.id, title: snip(mm.content, terms[0] ?? q, 60), snippet: mm.category, href: `/memory` });

  // Rank: exact phrase = big boost; then count of distinct terms present.
  const phrase = q.toLowerCase();
  for (const hit of hits) {
    const haystack = `${hit.title} ${hit.snippet}`.toLowerCase();
    let score = haystack.includes(phrase) ? 100 : 0;
    for (const term of terms) if (haystack.includes(term)) score += 1;
    hit.score = score;
  }
  hits.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  // Keep per-type variety: cap each type at `limit`.
  const perType = new Map<string, number>();
  return hits.filter((h) => {
    const n = perType.get(h.type) ?? 0;
    if (n >= limit) return false;
    perType.set(h.type, n + 1);
    return true;
  });
}

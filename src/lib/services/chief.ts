// AI Chief of Staff: grounded question answering. Retrieval runs through the
// permission-enforcing search plus structured lookups (activity calendar,
// infractions, contract watch); the model only ever sees authorized records
// and must cite them.
import type { Db } from "../db";
import { searchAll } from "../search";
import { answerGrounded } from "../ai/capabilities";
import type { Orchestrator } from "../ai/orchestrator";
import { contractWatch } from "./contracts";
import { activityBetween } from "../activity";

const STOPWORDS = new Set(["what", "when", "where", "which", "who", "how", "many", "much", "the", "a", "an", "is", "are", "was", "were", "do", "does", "did", "have", "has", "had", "my", "me", "i", "we", "our", "show", "tell", "about", "with", "for", "this", "that", "last", "next", "everything", "involving", "happened", "need", "needs", "should", "on", "in", "at", "of", "to", "and", "or", "prepare"]);

function keywords(question: string): string[] {
  return [...new Set(
    question
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  )];
}

export async function gatherContext(db: Db, userId: string, question: string) {
  const blocks: { source: string; href: string; content: string }[] = [];
  const terms = keywords(question);

  // Keyword retrieval across all authorized record types.
  const seen = new Set<string>();
  for (const term of terms.slice(0, 6)) {
    const hits = await searchAll(db, userId, term, 4);
    for (const hit of hits) {
      const key = `${hit.type}:${hit.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      blocks.push({ source: `${hit.type}: ${hit.title}`, href: hit.href, content: hit.snippet || hit.title });
    }
  }

  // Time-oriented questions get the activity calendar.
  if (/\b(today|yesterday|last week|this week|last month|recently|attention)\b/i.test(question)) {
    const from = new Date(Date.now() - 14 * 24 * 3600 * 1000);
    const events = await activityBetween(db, userId, from, new Date());
    if (events.length) {
      blocks.push({
        source: "Activity calendar (last 14 days)",
        href: "/calendar",
        content: events.map((e) => `${e.occurredAt.toISOString().slice(0, 10)}: ${e.summary}`).join("\n").slice(0, 4000),
      });
    }
  }

  // Deadline/contract questions get the live contract watch.
  if (/\b(contract|renewal|expir|deadline|countdown)\b/i.test(question)) {
    const watch = await contractWatch(db, userId);
    if (watch.length) {
      blocks.push({
        source: "Contract renewal watch",
        href: "/contracts",
        content: watch.map((w) => `${w.title}: ${w.kind} in ${w.daysRemaining} days${w.vendorName ? ` (vendor: ${w.vendorName})` : ""}`).join("\n"),
      });
    }
  }

  // Infraction questions get structured counts (mine only, by design).
  if (/\binfraction/i.test(question)) {
    const infractions = await db.infraction.findMany({ where: { recordedById: userId }, include: { director: true } });
    if (infractions.length) {
      const byDirector = new Map<string, number>();
      for (const i of infractions) byDirector.set(i.director.name, (byDirector.get(i.director.name) ?? 0) + 1);
      blocks.push({
        source: "Infractions I recorded",
        href: "/directors",
        content: [...byDirector.entries()].map(([name, count]) => `${name}: ${count} infraction(s)`).join("\n"),
      });
    }
  }

  // Back-burner questions.
  if (/\bback.?burner|radar\b/i.test(question)) {
    const items = await db.siteObservation.findMany({ where: { category: "BACKBURNER" }, include: { site: true }, take: 20 });
    if (items.length) {
      blocks.push({
        source: "Back burner / radar items",
        href: "/sites",
        content: items.map((i) => `${i.site.name}: ${i.content}`).join("\n"),
      });
    }
  }

  // The executive's committed memory is always eligible context.
  const memories = await db.memoryItem.findMany({ where: { ownerId: userId }, take: 20, orderBy: { updatedAt: "desc" } });
  if (memories.length) {
    blocks.push({
      source: "My committed memory",
      href: "/memory",
      content: memories.map((m) => `[${m.category}] ${m.content}`).join("\n").slice(0, 3000),
    });
    await db.memoryItem.updateMany({ where: { ownerId: userId }, data: { lastUsedAt: new Date() } });
  }

  return blocks;
}

export async function askChief(db: Db, orchestrator: Orchestrator, userId: string, threadId: string | null, question: string) {
  let thread = threadId ? await db.chiefThread.findFirst({ where: { id: threadId, userId } }) : null;
  if (!thread) {
    thread = await db.chiefThread.create({ data: { userId, title: question.slice(0, 80) } });
  }
  await db.chiefMessage.create({ data: { threadId: thread.id, role: "user", content: question } });

  const blocks = await gatherContext(db, userId, question);
  const { answer, mode } = await answerGrounded(db, orchestrator, question, blocks, { userId });
  const sources = blocks.map((b) => ({ source: b.source, href: b.href }));

  await db.chiefMessage.create({
    data: { threadId: thread.id, role: "assistant", content: answer, sourcesJson: JSON.stringify(sources) },
  });
  return { threadId: thread.id, answer, sources, mode };
}

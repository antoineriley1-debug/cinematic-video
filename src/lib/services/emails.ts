// Email intelligence: intentional ingestion only (drag-drop / paste — never
// mailbox sync), duplicate detection, original-source preservation, AI or
// deterministic analysis, relationship suggestions requiring human
// confirmation, chronological timelines, and export.
import crypto from "node:crypto";
import type { Db } from "../db";
import { audit } from "../audit";
import { recordActivity } from "../activity";
import { link } from "../links";
import { parseJson } from "../validate";
import type { Orchestrator } from "../ai/orchestrator";
import { analyzeEmail } from "../ai/capabilities";
import { parseEml } from "../email/parse";

export type IngestResult = {
  emailId: string;
  duplicate: boolean;
  mode: "AI" | "EMERGENCY" | null;
  pendingSuggestions: number;
};

export async function ingestEmail(
  db: Db,
  orchestrator: Orchestrator,
  opts: { rawSource: string; uploadedById: string; batchId?: string },
): Promise<IngestResult> {
  const sha256 = crypto.createHash("sha256").update(opts.rawSource).digest("hex");

  const existing = await db.emailMessage.findUnique({ where: { sha256 } });
  if (existing) {
    return { emailId: existing.id, duplicate: true, mode: (existing.analysisMode as "AI" | "EMERGENCY" | null) ?? null, pendingSuggestions: 0 };
  }

  const parsed = parseEml(opts.rawSource);
  const email = await db.emailMessage.create({
    data: {
      batchId: opts.batchId ?? null,
      subject: parsed.subject || null,
      fromAddress: parsed.fromAddress || null,
      fromName: parsed.fromName || null,
      toJson: JSON.stringify(parsed.to),
      ccJson: JSON.stringify(parsed.cc),
      sentAt: parsed.sentAt,
      rawSource: opts.rawSource,
      bodyText: parsed.bodyText,
      sha256,
      uploadedById: opts.uploadedById,
    },
  });

  const analysis = await analyzeEmail(
    db,
    orchestrator,
    { subject: parsed.subject, bodyText: parsed.bodyText, fromAddress: parsed.fromAddress, fromName: parsed.fromName },
    { userId: opts.uploadedById, emailId: email.id },
  );

  await db.emailMessage.update({
    where: { id: email.id },
    data: {
      summary: analysis.summary,
      intent: analysis.intent,
      urgency: analysis.urgency,
      bulletsJson: JSON.stringify(analysis.bullets),
      actionsJson: JSON.stringify(analysis.actions),
      datesJson: JSON.stringify(analysis.dates),
      peopleJson: JSON.stringify(analysis.people),
      analysisMode: analysis.mode,
      analysisStatus: "ANALYZED",
    },
  });

  // Relationship suggestions are stored unconfirmed — a human confirms or
  // rejects them before they become permanent connections.
  let pending = 0;
  const suggest = async (toType: "SITE" | "DIRECTOR" | "VENDOR" | "CONTRACT" | "PROJECT", ids: string[]) => {
    for (const id of ids) {
      await link(db, { type: "EMAIL", id: email.id }, { type: toType, id }, {
        confirmed: false,
        suggestedBy: analysis.mode === "AI" ? "AI" : "EMERGENCY",
        createdById: opts.uploadedById,
      });
      pending++;
    }
  };
  await suggest("SITE", analysis.suggestedSites);
  await suggest("DIRECTOR", analysis.suggestedDirectors);
  await suggest("VENDOR", analysis.suggestedVendors);
  await suggest("CONTRACT", analysis.suggestedContracts);
  await suggest("PROJECT", analysis.suggestedProjects);

  await audit(db, { actorId: opts.uploadedById, action: "EMAIL_INGESTED", entityType: "EMAIL", entityId: email.id, after: { subject: parsed.subject, mode: analysis.mode } });
  await recordActivity(db, {
    userId: opts.uploadedById,
    type: "EMAIL_ANALYZED",
    summary: `Email analyzed: ${parsed.subject || "(no subject)"}`,
    entityType: "EMAIL",
    entityId: email.id,
    occurredAt: parsed.sentAt ?? undefined,
  });

  return { emailId: email.id, duplicate: false, mode: analysis.mode, pendingSuggestions: pending };
}

export type TimelineEntry = {
  emailId: string;
  date: Date | null;
  sender: string;
  recipients: string[];
  subject: string;
  event: string; // identified event / summary
  bullets: string[];
  actions: string[];
  urgency: string | null;
};

/** Chronological email-event timeline over a batch or a set of email ids. */
export async function buildTimeline(db: Db, filter: { batchId?: string; emailIds?: string[] }): Promise<TimelineEntry[]> {
  const emails = await db.emailMessage.findMany({
    where: filter.batchId ? { batchId: filter.batchId } : { id: { in: filter.emailIds ?? [] } },
  });
  const entries = emails.map((e) => ({
    emailId: e.id,
    date: e.sentAt ?? e.createdAt,
    sender: e.fromName || e.fromAddress || "Unknown sender",
    recipients: parseJson<string[]>(e.toJson, []),
    subject: e.subject ?? "(no subject)",
    event: e.summary ?? "",
    bullets: parseJson<string[]>(e.bulletsJson, []),
    actions: parseJson<string[]>(e.actionsJson, []),
    urgency: e.urgency,
  }));
  entries.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
  return entries;
}

/** Plain-text export of a chronological email timeline for reporting. */
export function exportTimelineText(entries: TimelineEntry[], title: string): string {
  const lines: string[] = [`EMAIL CHRONOLOGY — ${title}`, `Generated by Crothall Executive OS`, ""];
  for (const e of entries) {
    const date = e.date
      ? e.date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "Undated";
    lines.push(`${date} — ${e.sender}`);
    lines.push(`Subject: ${e.subject}`);
    if (e.recipients.length) lines.push(`To: ${e.recipients.join(", ")}`);
    if (e.event) lines.push(e.event);
    for (const b of e.bullets) lines.push(`  • ${b}`);
    if (e.actions.length) {
      lines.push(`  Actions:`);
      for (const a of e.actions) lines.push(`    - ${a}`);
    }
    lines.push(`  [Source email ID: ${e.emailId}]`);
    lines.push("");
  }
  return lines.join("\n");
}

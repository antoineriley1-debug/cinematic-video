// Drains AI work queued during a total provider outage. Re-runs the
// AI-quality analysis for records that were served deterministically and
// marks queue items DONE. Stops early if providers are still (or again)
// unavailable, leaving remaining items queued — nothing is lost.
import type { Db } from "../db";
import { parseJson } from "../validate";
import type { Orchestrator } from "../ai/orchestrator";
import { analyzeEmail, analyzeMeeting } from "../ai/capabilities";

export async function drainAiQueue(
  db: Db,
  orchestrator: Orchestrator,
  limit = 20,
): Promise<{ processed: number; remaining: number }> {
  const items = await db.aiQueueItem.findMany({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let processed = 0;

  for (const item of items) {
    const payload = parseJson<{ emailId?: string; meetingId?: string }>(item.payloadJson, {});
    let ok = false;

    if (item.capability === "email.analyze" && payload.emailId) {
      const email = await db.emailMessage.findUnique({ where: { id: payload.emailId } });
      if (!email) {
        ok = true; // record deleted — nothing to redo
      } else {
        const analysis = await analyzeEmail(db, orchestrator, {
          subject: email.subject ?? "",
          bodyText: email.bodyText ?? "",
          fromAddress: email.fromAddress ?? undefined,
          fromName: email.fromName ?? undefined,
        });
        if (analysis.mode === "AI") {
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
              analysisMode: "AI",
            },
          });
          ok = true;
        }
      }
    } else if (item.capability === "meeting.analyze" && payload.meetingId) {
      const meeting = await db.meeting.findUnique({ where: { id: payload.meetingId } });
      if (!meeting) {
        ok = true;
      } else {
        const analysis = await analyzeMeeting(db, orchestrator, meeting.minutesText);
        if (analysis.mode === "AI") {
          await db.meeting.update({
            where: { id: meeting.id },
            data: {
              summary: analysis.summary,
              decisionsJson: JSON.stringify(analysis.decisions),
              actionsJson: JSON.stringify(analysis.actions),
              unresolvedJson: JSON.stringify(analysis.unresolved),
              analysisMode: "AI",
            },
          });
          ok = true;
        }
      }
    } else {
      ok = true; // unknown/legacy capability — retire the item
    }

    if (ok) {
      await db.aiQueueItem.update({ where: { id: item.id }, data: { status: "DONE", processedAt: new Date() } });
      processed++;
    } else {
      break; // providers still down — stop and retry on the next drain
    }
  }

  const remaining = await db.aiQueueItem.count({ where: { status: "QUEUED" } });
  return { processed, remaining };
}

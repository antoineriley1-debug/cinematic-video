import type { Db } from "./db";
import { mailEnabled, sendNotificationEmail } from "./mailer";

// Notification types that also go out by email when SMTP is configured
// (spec: mentions/attention flags get immediate in-app + optional email).
const EMAIL_TYPES = new Set(["MENTION", "ATTENTION", "ALERT"]);

export async function notify(
  db: Db,
  entry: {
    userId: string;
    type: "MENTION" | "ATTENTION" | "ALERT" | "MESSAGE" | "SYSTEM" | "AI_CONTINUITY";
    title: string;
    body?: string;
    entityType?: string;
    entityId?: string;
  },
) {
  const notification = await db.notification.create({
    data: {
      userId: entry.userId,
      type: entry.type,
      title: entry.title,
      body: entry.body ?? null,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
    },
  });
  if (EMAIL_TYPES.has(entry.type) && mailEnabled()) {
    const user = await db.user.findUnique({ where: { id: entry.userId } });
    if (user?.email) {
      const base = process.env.APP_BASE_URL?.replace(/\/$/, "");
      await sendNotificationEmail(db, {
        to: user.email,
        title: entry.title,
        body: entry.body,
        href: base ? `${base}/notifications` : undefined,
      });
    }
  }
  return notification;
}

/** Parse @mentions (@FirstName or @First.Last or @email-local-part) from text. */
export function extractMentions(text: string): string[] {
  const matches = text.matchAll(/@([A-Za-z][\w.]*)/g);
  return [...new Set([...matches].map((m) => m[1].toLowerCase()))];
}

/**
 * Resolve mention handles against users (by first name or email local part)
 * and deliver attention notifications linking to the source object.
 */
export async function deliverMentions(
  db: Db,
  opts: {
    text: string;
    actorId: string;
    actorName: string;
    entityType: string;
    entityId: string;
    contextTitle: string;
  },
): Promise<string[]> {
  const handles = extractMentions(opts.text);
  if (handles.length === 0) return [];
  const users = await db.user.findMany({ where: { active: true } });
  const notified: string[] = [];
  for (const user of users) {
    if (user.id === opts.actorId) continue;
    const first = user.name.split(/\s+/)[0]?.toLowerCase();
    const local = user.email.split("@")[0]?.toLowerCase();
    const full = user.name.replace(/\s+/g, ".").toLowerCase();
    if (handles.some((h) => h === first || h === local || h === full)) {
      await notify(db, {
        userId: user.id,
        type: "MENTION",
        title: `${opts.actorName} mentioned you`,
        body: opts.contextTitle,
        entityType: opts.entityType,
        entityId: opts.entityId,
      });
      notified.push(user.id);
    }
  }
  return notified;
}

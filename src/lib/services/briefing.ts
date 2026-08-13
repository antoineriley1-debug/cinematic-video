// Personalized Daily Executive Briefing — the default opening experience.
// Each executive's briefing differs because private notes, attention states,
// and acknowledgements differ. Acknowledged items drop out of THIS user's
// recurring briefing only; source records always remain.
import type { Db } from "../db";
import { getSetting } from "../settings";
import { contractWatch, type ContractWatchItem } from "./contracts";
import { parseJson } from "../validate";

export type BriefingItem = {
  key: string; // stable id for acknowledgement
  kind: string;
  title: string;
  detail: string;
  href: string;
  requiresAck: boolean;
  acknowledged: boolean;
  urgency: "INFO" | "ATTENTION" | "CRITICAL";
};

export type Briefing = {
  date: string;
  greetingName: string;
  items: BriefingItem[];
  contractWatch: ContractWatchItem[];
  generatedAt: Date;
};

export async function buildBriefing(db: Db, userId: string, now = new Date()): Promise<Briefing> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const items: BriefingItem[] = [];
  const acks = await db.acknowledgement.findMany({ where: { userId, itemType: "BRIEFING_ITEM" } });
  const ackSet = new Set(acks.map((a) => a.itemId));
  const push = (item: Omit<BriefingItem, "acknowledged">) => {
    const acknowledged = ackSet.has(item.key);
    if (item.requiresAck && acknowledged) return; // out of the recurring briefing for this executive
    items.push({ ...item, acknowledged });
  };

  // Unread mentions & attention flags.
  const mentions = await db.notification.findMany({
    where: { userId, type: { in: ["MENTION", "ATTENTION"] }, readAt: null },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  for (const n of mentions) {
    push({
      key: `notif:${n.id}`,
      kind: "MENTION",
      title: n.title,
      detail: n.body ?? "",
      href: n.entityType && n.entityId ? hrefFor(n.entityType, n.entityId) : "/notifications",
      requiresAck: false,
      urgency: "ATTENTION",
    });
  }

  // Meeting minutes uploaded since the previous briefing (next-day rule).
  const lookbackHours = await getSetting(db, "briefing.meetingLookbackHours");
  const meetings = await db.meeting.findMany({
    where: {
      OR: [{ briefedAt: null }, { createdAt: { gte: new Date(now.getTime() - lookbackHours * 3600 * 1000) } }],
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  for (const m of meetings) {
    const decisions = parseJson<string[]>(m.decisionsJson, []);
    push({
      key: `meeting:${m.id}`,
      kind: "MEETING",
      title: `Meeting: ${m.title}`,
      detail: [m.summary?.slice(0, 200), decisions.length ? `${decisions.length} decision(s)` : null].filter(Boolean).join(" — "),
      href: `/meetings/${m.id}`,
      requiresAck: true,
      urgency: "INFO",
    });
  }

  // Open critical matters across assigned sites.
  const criticals = await db.siteObservation.findMany({
    where: { category: "CRITICAL" },
    include: { site: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  for (const c of criticals) {
    push({
      key: `critical:${c.id}`,
      kind: "CRITICAL_MATTER",
      title: `Critical matter at ${c.site.name}`,
      detail: c.content.slice(0, 200),
      href: `/sites/${c.siteId}`,
      requiresAck: true,
      urgency: "CRITICAL",
    });
  }

  // Pattern & threshold alerts (director, vendor, providers). Whether an
  // infraction-threshold alert demands acknowledgement follows the
  // admin-configured rule.
  const infractionRule = await getSetting(db, "infraction.alertRule");
  const alerts = await db.alert.findMany({ orderBy: { createdAt: "desc" }, take: 15 });
  for (const a of alerts) {
    const requiresAck = a.type === "INFRACTION_THRESHOLD" ? infractionRule.requireAcknowledgement : true;
    push({
      key: `alert:${a.id}`,
      kind: a.type,
      title: a.title,
      detail: a.body ?? "",
      href: a.entityType && a.entityId ? hrefFor(a.entityType, a.entityId) : "/dashboard",
      requiresAck,
      urgency: a.type === "PROVIDER_OUTAGE" ? "ATTENTION" : "CRITICAL",
    });
  }

  // Due & overdue actions/deadlines owned by this executive.
  const dueSoon = await db.actionItem.findMany({
    where: {
      status: "OPEN",
      OR: [{ ownerId: userId }, { createdById: userId }],
      dueDate: { lte: new Date(now.getTime() + 7 * 24 * 3600 * 1000) },
    },
    orderBy: { dueDate: "asc" },
    take: 10,
  });
  for (const a of dueSoon) {
    const overdue = a.dueDate && a.dueDate < now;
    push({
      key: `action:${a.id}`,
      kind: a.kind === "DEADLINE" ? "DEADLINE" : "ACTION",
      title: `${overdue ? "OVERDUE: " : ""}${a.title}`,
      detail: a.dueDate ? `Due ${a.dueDate.toDateString()}` : "",
      href: "/actions",
      requiresAck: false,
      urgency: overdue ? "CRITICAL" : "ATTENTION",
    });
  }

  // Recent public notes from other executives.
  const publicNotes = await db.note.findMany({
    where: { visibility: "PUBLIC", authorId: { not: userId }, createdAt: { gte: new Date(now.getTime() - 3 * 24 * 3600 * 1000) } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  for (const n of publicNotes) {
    push({
      key: `note:${n.id}`,
      kind: "PUBLIC_NOTE",
      title: `Public note: ${n.title ?? "(untitled)"}`,
      detail: n.content.slice(0, 150),
      href: `/notes/${n.id}`,
      requiresAck: false,
      urgency: "INFO",
    });
  }

  // My private flags awaiting follow-up.
  const flags = await db.flag.findMany({ where: { userId }, take: 8, orderBy: { createdAt: "desc" } });
  for (const f of flags) {
    push({
      key: `flag:${f.id}`,
      kind: "MY_FLAG",
      title: `Flagged ${f.label.replaceAll("_", " ").toLowerCase()}: ${f.entityType.toLowerCase()}`,
      detail: "",
      href: hrefFor(f.entityType, f.entityId),
      requiresAck: false,
      urgency: "INFO",
    });
  }

  const watch = (await contractWatch(db, userId, now)).filter((w) => !w.acknowledged);

  const date = now.toLocaleDateString("en-CA"); // local-timezone YYYY-MM-DD
  const briefing: Briefing = {
    date,
    greetingName: user.name.split(/\s+/)[0],
    items,
    contractWatch: watch,
    generatedAt: now,
  };

  // Persist for history/export; mark included meetings as briefed.
  await db.briefingRecord.upsert({
    where: { userId_date: { userId, date } },
    update: { contentJson: JSON.stringify(briefing) },
    create: { userId, date, contentJson: JSON.stringify(briefing) },
  });
  await db.meeting.updateMany({ where: { id: { in: meetings.map((m) => m.id) }, briefedAt: null }, data: { briefedAt: now } });

  return briefing;
}

export function hrefFor(entityType: string, entityId: string): string {
  switch (entityType) {
    case "SITE": return `/sites/${entityId}`;
    case "DIRECTOR": return `/directors/${entityId}`;
    case "VENDOR": return `/vendors/${entityId}`;
    case "CONTRACT": return `/contracts/${entityId}`;
    case "PROJECT": return `/projects`;
    case "EMAIL": return `/emails/${entityId}`;
    case "MEETING": return `/meetings/${entityId}`;
    case "PLAUD": return `/plaud/${entityId}`;
    case "NOTE": return `/notes/${entityId}`;
    case "CONVERSATION": return `/messages/${entityId}`;
    case "SITE_VISIT": return `/visits/${entityId}`;
    default: return "/dashboard";
  }
}

/** Acknowledge one briefing item for this executive only. */
export async function acknowledgeBriefingItem(db: Db, userId: string, itemKey: string) {
  await db.acknowledgement.upsert({
    where: { userId_itemType_itemId: { userId, itemType: "BRIEFING_ITEM", itemId: itemKey } },
    update: {},
    create: { userId, itemType: "BRIEFING_ITEM", itemId: itemKey },
  });
}

export function exportBriefingText(briefing: Briefing): string {
  const lines = [
    `DAILY EXECUTIVE BRIEFING — ${briefing.date}`,
    `Prepared for ${briefing.greetingName} by Crothall Executive OS`,
    "",
  ];
  for (const item of briefing.items) {
    lines.push(`[${item.urgency}] ${item.title}`);
    if (item.detail) lines.push(`    ${item.detail}`);
    lines.push(`    Source: ${item.href}`);
  }
  if (briefing.contractWatch.length) {
    lines.push("", "CONTRACT RENEWAL WATCH");
    for (const w of briefing.contractWatch) {
      lines.push(`  ${w.daysRemaining} DAYS — ${w.title} (${w.kind.replaceAll("_", " ")})${w.vendorName ? ` — ${w.vendorName}` : ""}`);
    }
  }
  return lines.join("\n");
}

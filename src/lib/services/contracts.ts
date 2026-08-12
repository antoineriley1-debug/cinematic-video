// Contract renewal intelligence: the configurable N-day contract watch,
// per-executive acknowledgement, and countdown computation.
import type { Db } from "../db";
import { getSetting } from "../settings";

export type ContractWatchItem = {
  contractId: string;
  title: string;
  vendorName: string | null;
  kind: "EXPIRATION" | "RENEWAL" | "NOTICE_DEADLINE";
  date: Date;
  daysRemaining: number;
  acknowledged: boolean;
  openConcerns: number;
};

export function daysUntil(date: Date, now = new Date()): number {
  return Math.ceil((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Contracts entering the configured renewal/expiration window, with the
 * viewer's own acknowledgement state. Acknowledgement never affects other
 * executives, and the deadline stays on the contract record regardless.
 */
export async function contractWatch(db: Db, viewerId: string, now = new Date()): Promise<ContractWatchItem[]> {
  const windowDays = await getSetting(db, "contracts.watchWindowDays");
  const horizon = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
  const contracts = await db.contract.findMany({
    where: { status: "ACTIVE" },
    include: { vendor: true },
  });
  const acks = await db.acknowledgement.findMany({ where: { userId: viewerId, itemType: "CONTRACT_WATCH" } });
  const ackSet = new Set(acks.map((a) => a.itemId));

  const items: ContractWatchItem[] = [];
  for (const contract of contracts) {
    const candidates: { kind: ContractWatchItem["kind"]; date: Date | null }[] = [
      { kind: "EXPIRATION", date: contract.endDate },
      { kind: "RENEWAL", date: contract.renewalDate },
      { kind: "NOTICE_DEADLINE", date: contract.noticeDeadline },
    ];
    for (const c of candidates) {
      if (!c.date) continue;
      if (c.date >= now && c.date <= horizon) {
        const openConcerns = contract.vendorId
          ? await db.vendorPerformanceRecord.count({
              where: { vendorId: contract.vendorId, type: { in: ["CONCERN", "CONTRACT_CONCERN", "ESCALATION"] } },
            })
          : 0;
        items.push({
          contractId: contract.id,
          title: contract.title,
          vendorName: contract.vendor?.name ?? null,
          kind: c.kind,
          date: c.date,
          daysRemaining: daysUntil(c.date, now),
          acknowledged: ackSet.has(`${contract.id}:${c.kind}`),
          openConcerns,
        });
      }
    }
  }
  items.sort((a, b) => a.daysRemaining - b.daysRemaining);
  return items;
}

/** Acknowledge one watch item for one executive only. */
export async function acknowledgeWatchItem(db: Db, userId: string, contractId: string, kind: string) {
  await db.acknowledgement.upsert({
    where: { userId_itemType_itemId: { userId, itemType: "CONTRACT_WATCH", itemId: `${contractId}:${kind}` } },
    update: {},
    create: { userId, itemType: "CONTRACT_WATCH", itemId: `${contractId}:${kind}` },
  });
}

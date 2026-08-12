import { describe, it, expect } from "vitest";
import { db, makeUser, makeSite, mockOrchestrator, MEETING_ANALYSIS_JSON, uniq } from "./helpers";
import { buildBriefing, acknowledgeBriefingItem, exportBriefingText } from "@/lib/services/briefing";
import { uploadMeeting } from "@/lib/services/meetings";
import { getOrCreateDirectConversation, sendMessage, unreadCount, markRead, maybeBriefInactiveConversations } from "@/lib/services/messaging";
import { searchAll } from "@/lib/search";
import { deliverMentions } from "@/lib/notify";

describe("daily executive briefing", () => {
  it("greets by first name and includes uploaded meetings (next-day rule)", async () => {
    const user = await makeUser("EXECUTIVE", "Antoine Riley");
    const { orchestrator } = mockOrchestrator({ primaryResponder: () => MEETING_ANALYSIS_JSON });
    const { meetingId } = await uploadMeeting(db, orchestrator, {
      title: "Weekly Ops Review " + uniq("m"),
      minutesText: "We decided to approve the budget. Please post two openings.",
      uploadedById: user.id,
    });

    const briefing = await buildBriefing(db, user.id);
    expect(briefing.greetingName).toBe("Antoine");
    const meetingItem = briefing.items.find((i) => i.key === `meeting:${meetingId}`);
    expect(meetingItem).toBeTruthy();
    expect(meetingItem!.href).toBe(`/meetings/${meetingId}`); // links to original record

    // Meeting extraction produced real action items connected to the source.
    const actions = await db.actionItem.findMany({ where: { sourceType: "MEETING", sourceId: meetingId } });
    expect(actions.length).toBeGreaterThan(0);
  });

  it("acknowledgement removes an item for that executive only, and source records remain", async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const site = await makeSite();
    const critical = await db.siteObservation.create({
      data: { siteId: site.id, category: "CRITICAL", content: "Boiler failure risk before survey", createdById: userA.id },
    });

    const key = `critical:${critical.id}`;
    let briefingA = await buildBriefing(db, userA.id);
    expect(briefingA.items.some((i) => i.key === key)).toBe(true);

    await acknowledgeBriefingItem(db, userA.id, key);
    briefingA = await buildBriefing(db, userA.id);
    expect(briefingA.items.some((i) => i.key === key)).toBe(false);

    const briefingB = await buildBriefing(db, userB.id);
    expect(briefingB.items.some((i) => i.key === key)).toBe(true); // untouched for others
    expect(await db.siteObservation.count({ where: { id: critical.id } })).toBe(1); // record remains
  });

  it("briefings are personalized per executive and exportable", async () => {
    const userA = await makeUser("EXECUTIVE", "Alpha One");
    const userB = await makeUser("EXECUTIVE", "Beta Two");
    await db.flag.create({ data: { userId: userA.id, entityType: "VENDOR", entityId: "v-x", label: "FOLLOW_UP" } });

    const briefingA = await buildBriefing(db, userA.id);
    const briefingB = await buildBriefing(db, userB.id);
    expect(briefingA.items.some((i) => i.kind === "MY_FLAG")).toBe(true);
    expect(briefingB.items.some((i) => i.kind === "MY_FLAG" && i.href.includes("v-x"))).toBe(false);

    const text = exportBriefingText(briefingA);
    expect(text).toContain("DAILY EXECUTIVE BRIEFING");
    expect(text).toContain("Alpha");
  });
});

describe("messaging", () => {
  it("delivers messages with unread counts and notifications; enforces participant authorization", async () => {
    const alice = await makeUser("EXECUTIVE", "Alice Grant");
    const bob = await makeUser("EXECUTIVE", "Bob Lane");
    const eve = await makeUser("EXECUTIVE", "Eve Snoop");
    const convo = await getOrCreateDirectConversation(db, alice.id, bob.id);

    await sendMessage(db, { conversationId: convo.id, senderId: alice.id, content: "Can you review the Mercy contract?" });
    expect(await unreadCount(db, bob.id)).toBe(1);
    expect(await unreadCount(db, alice.id)).toBe(0);

    const notices = await db.notification.findMany({ where: { userId: bob.id, type: "MESSAGE" } });
    expect(notices.length).toBe(1);

    await markRead(db, convo.id, bob.id);
    expect(await unreadCount(db, bob.id)).toBe(0);

    await expect(
      sendMessage(db, { conversationId: convo.id, senderId: eve.id, content: "let me in" }),
    ).rejects.toThrow(/participant/);
  });

  it("supports sharing objects into a conversation", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const convo = await getOrCreateDirectConversation(db, a.id, b.id);
    const msg = await sendMessage(db, {
      conversationId: convo.id,
      senderId: a.id,
      content: "Look at this contract",
      sharedEntityType: "CONTRACT",
      sharedEntityId: "contract-123",
    });
    expect(msg.sharedEntityType).toBe("CONTRACT");
  });

  it("@mentions notify the mentioned executive with a link to the source", async () => {
    const heather = await makeUser("EXECUTIVE", "Heather Collins");
    const author = await makeUser("EXECUTIVE", "Author Person");
    const notified = await deliverMentions(db, {
      text: "@Heather please look at this vendor issue",
      actorId: author.id,
      actorName: author.name,
      entityType: "NOTE",
      entityId: "note-1",
      contextTitle: "on a public note",
    });
    expect(notified).toContain(heather.id);
    const notice = await db.notification.findFirst({ where: { userId: heather.id, type: "MENTION" } });
    expect(notice!.entityType).toBe("NOTE");
  });

  it("creates conversation briefs for inactive conversations without destroying messages", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const convo = await getOrCreateDirectConversation(db, a.id, b.id);
    await sendMessage(db, { conversationId: convo.id, senderId: a.id, content: "We agreed to renew the boiler contract." });
    // Age the message past the inactivity window.
    await db.chatMessage.updateMany({
      where: { conversationId: convo.id },
      data: { createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
    });

    const { orchestrator, primary, secondary } = mockOrchestrator();
    primary.up = false;
    secondary.up = false; // deterministic path
    const briefed = await maybeBriefInactiveConversations(db, orchestrator);
    expect(briefed).toContain(convo.id);
    const brief = await db.conversationBrief.findFirst({ where: { conversationId: convo.id } });
    expect(JSON.parse(brief!.content).mode).toBe("EMERGENCY");
    expect(await db.chatMessage.count({ where: { conversationId: convo.id } })).toBe(1); // retention respected
  });
});

describe("search authorization", () => {
  it("never returns another executive's private notes or memory", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const secret = "confidential-succession-planning-" + uniq("q");
    await db.note.create({ data: { content: `Private thought about ${secret}`, authorId: owner.id, visibility: "PRIVATE" } });
    await db.memoryItem.create({ data: { ownerId: owner.id, content: `Memory about ${secret}` } });

    const ownerHits = await searchAll(db, owner.id, secret);
    expect(ownerHits.length).toBeGreaterThanOrEqual(2);

    const otherHits = await searchAll(db, other.id, secret);
    expect(otherHits.length).toBe(0);
  });

  it("public notes are searchable by all executives", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const marker = "shared-vendor-observation-" + uniq("q");
    await db.note.create({ data: { content: marker, authorId: owner.id, visibility: "PUBLIC" } });
    const hits = await searchAll(db, other.id, marker);
    expect(hits.length).toBe(1);
    expect(hits[0].type).toBe("Public Note");
  });
});

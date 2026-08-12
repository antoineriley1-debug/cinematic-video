"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, requireAdmin } from "@/lib/auth";
import { getOrchestrator } from "@/lib/ai/orchestrator";
import { audit } from "@/lib/audit";
import { recordActivity } from "@/lib/activity";
import { notify, deliverMentions } from "@/lib/notify";
import { link, confirmLink, rejectLink } from "@/lib/links";
import { setSetting, type SettingsShape } from "@/lib/settings";
import {
  zObservationCategory,
  zDirectorFileClassification,
  zInfractionSeverity,
  zVendorPerformanceType,
  zFlagLabel,
  zPersonality,
  zEntityType,
  type EntityType,
} from "@/lib/validate";
import { ingestEmail } from "@/lib/services/emails";
import { addToDirectorFile, recordInfraction } from "@/lib/services/directors";
import { recordVendorPerformance } from "@/lib/services/vendors";
import { acknowledgeWatchItem } from "@/lib/services/contracts";
import { acknowledgeBriefingItem } from "@/lib/services/briefing";
import { uploadMeeting } from "@/lib/services/meetings";
import { importPlaudRecording } from "@/lib/services/plaud";
import { startVisit, addVisitObservation, completeVisit } from "@/lib/services/visits";
import { getOrCreateDirectConversation, createGroupConversation, sendMessage, markRead } from "@/lib/services/messaging";
import { askChief } from "@/lib/services/chief";
import { draftEmailReply } from "@/lib/ai/capabilities";
import { drainAiQueue } from "@/lib/services/aiQueue";
import { storeFile } from "@/lib/storage";
import { getSetting } from "@/lib/settings";

async function storeUploads(
  formData: FormData,
  field: string,
  ownerId: string,
  entityType: string,
  entityId: string,
) {
  const maxBytes = await getSetting(prisma, "uploads.maxBytes");
  const files = formData.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of files.slice(0, 10)) {
    await storeFile(prisma, {
      buffer: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      ownerId,
      entityType,
      entityId,
      maxBytes,
    });
  }
  return files.length;
}

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const opt = (fd: FormData, key: string) => str(fd, key) || undefined;
const optDate = (fd: FormData, key: string) => {
  const v = str(fd, key);
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
};

// ---------- Briefing / acknowledgements ----------

export async function ackBriefingItemAction(formData: FormData) {
  const user = await requireUser();
  await acknowledgeBriefingItem(prisma, user.id, str(formData, "key"));
  revalidatePath("/briefing");
}

export async function ackContractWatchAction(formData: FormData) {
  const user = await requireUser();
  await acknowledgeWatchItem(prisma, user.id, str(formData, "contractId"), str(formData, "kind"));
  revalidatePath("/briefing");
  revalidatePath("/contracts");
}

// ---------- Email intelligence ----------

export async function ingestEmailAction(formData: FormData) {
  const user = await requireUser();
  const orchestrator = await getOrchestrator(prisma);
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const pasted = str(formData, "pasted");
  let batchId = opt(formData, "batchId");

  const sources: string[] = [];
  for (const file of files) sources.push(Buffer.from(await file.arrayBuffer()).toString("utf8"));
  if (pasted) sources.push(pasted);
  if (sources.length === 0) return;

  if (sources.length > 1 && !batchId) {
    const batch = await prisma.emailBatch.create({
      data: { title: opt(formData, "batchTitle") ?? `Email batch ${new Date().toLocaleDateString()}`, createdById: user.id },
    });
    batchId = batch.id;
  }

  let lastId = "";
  for (const rawSource of sources) {
    const result = await ingestEmail(prisma, orchestrator, { rawSource, uploadedById: user.id, batchId });
    lastId = result.emailId;
  }
  revalidatePath("/emails");
  if (batchId) redirect(`/emails/batch/${batchId}`);
  redirect(`/emails/${lastId}`);
}

export async function draftReplyAction(formData: FormData) {
  const user = await requireUser();
  const orchestrator = await getOrchestrator(prisma);
  const emailId = str(formData, "emailId");
  const personality = zPersonality.parse(str(formData, "personality"));
  const email = await prisma.emailMessage.findUniqueOrThrow({ where: { id: emailId } });

  const result = await draftEmailReply(
    prisma,
    orchestrator,
    personality,
    {
      recipientName: email.fromName || undefined,
      senderName: user.name,
      subject: email.subject ?? "",
      issue: email.summary || email.subject || "the matter in your email",
      expectedAction: opt(formData, "expectedAction"),
      completionDate: opt(formData, "completionDate"),
    },
    email.bodyText ?? email.rawSource,
    { userId: user.id },
  );
  await prisma.emailDraft.create({
    data: { emailId, personality, subject: `Re: ${email.subject ?? ""}`, content: result.content, mode: result.mode, createdById: user.id },
  });
  await recordActivity(prisma, { userId: user.id, type: "EMAIL_DRAFTED", summary: `Drafted ${personality} reply to: ${email.subject ?? "(no subject)"}`, entityType: "EMAIL", entityId: emailId });
  await audit(prisma, { actorId: user.id, action: "EMAIL_DRAFT_CREATED", entityType: "DRAFT", entityId: emailId, after: { personality, mode: result.mode } });
  revalidatePath(`/emails/${emailId}`);
}

export async function confirmLinkAction(formData: FormData) {
  const user = await requireUser();
  const linkId = str(formData, "linkId");
  await confirmLink(prisma, linkId);
  await audit(prisma, { actorId: user.id, action: "LINK_CONFIRMED", entityType: "EMAIL", entityId: linkId });
  revalidatePath(str(formData, "path") || "/emails");
}

export async function rejectLinkAction(formData: FormData) {
  const user = await requireUser();
  const linkId = str(formData, "linkId");
  await rejectLink(prisma, linkId);
  await audit(prisma, { actorId: user.id, action: "LINK_REJECTED", entityType: "EMAIL", entityId: linkId });
  revalidatePath(str(formData, "path") || "/emails");
}

export async function addLinkAction(formData: FormData) {
  const user = await requireUser();
  const fromType = zEntityType.parse(str(formData, "fromType")) as EntityType;
  const toType = zEntityType.parse(str(formData, "toType")) as EntityType;
  await link(prisma, { type: fromType, id: str(formData, "fromId") }, { type: toType, id: str(formData, "toId") }, { createdById: user.id });
  revalidatePath(str(formData, "path") || "/");
}

// ---------- Director module ----------

export async function addDirectorFileEntryAction(formData: FormData) {
  const user = await requireUser();
  await addToDirectorFile(prisma, {
    directorId: str(formData, "directorId"),
    classification: zDirectorFileClassification.parse(str(formData, "classification")),
    content: str(formData, "content"),
    sourceType: opt(formData, "sourceType"),
    sourceId: opt(formData, "sourceId"),
    visibility: str(formData, "visibility") === "SHARED" ? "SHARED" : "PRIVATE",
    createdById: user.id,
    humanConfirmed: true,
  });
  revalidatePath(`/directors/${str(formData, "directorId")}`);
}

export async function recordInfractionAction(formData: FormData) {
  const user = await requireUser();
  const directorId = str(formData, "directorId");
  await recordInfraction(prisma, {
    directorId,
    siteId: opt(formData, "siteId"),
    category: str(formData, "category") || "GENERAL",
    severity: zInfractionSeverity.parse(str(formData, "severity")),
    description: str(formData, "description"),
    expectedCorrection: opt(formData, "expectedCorrection"),
    followUpDate: optDate(formData, "followUpDate"),
    recordedById: user.id,
  });
  revalidatePath(`/directors/${directorId}`);
}

export async function createDirectorAction(formData: FormData) {
  const user = await requireUser();
  const director = await prisma.director.create({
    data: { name: str(formData, "name"), title: opt(formData, "title"), email: opt(formData, "email"), siteId: opt(formData, "siteId") ?? null },
  });
  await audit(prisma, { actorId: user.id, action: "DIRECTOR_CREATED", entityType: "DIRECTOR", entityId: director.id });
  revalidatePath("/directors");
}

// ---------- Sites & visits ----------

export async function createSiteAction(formData: FormData) {
  const user = await requireUser();
  const site = await prisma.site.create({
    data: { name: str(formData, "name"), code: str(formData, "code").toUpperCase(), location: opt(formData, "location") },
  });
  await prisma.siteAssignment.create({ data: { userId: user.id, siteId: site.id } });
  await audit(prisma, { actorId: user.id, action: "SITE_CREATED", entityType: "SITE", entityId: site.id });
  revalidatePath("/sites");
}

export async function addSiteObservationAction(formData: FormData) {
  const user = await requireUser();
  const siteId = str(formData, "siteId");
  await prisma.siteObservation.create({
    data: { siteId, category: zObservationCategory.parse(str(formData, "category")), content: str(formData, "content"), createdById: user.id },
  });
  await recordActivity(prisma, { userId: user.id, type: "SITE_OBSERVATION", summary: `Site observation recorded (${str(formData, "category")})`, entityType: "SITE", entityId: siteId });
  revalidatePath(`/sites/${siteId}`);
}

export async function startVisitAction(formData: FormData) {
  const user = await requireUser();
  const visit = await startVisit(prisma, str(formData, "siteId"), user.id);
  redirect(`/visits/${visit.id}`);
}

export async function addVisitObservationAction(formData: FormData) {
  const user = await requireUser();
  const visitId = str(formData, "visitId");
  await addVisitObservation(prisma, {
    visitId,
    category: zObservationCategory.parse(str(formData, "category")),
    content: str(formData, "content"),
    createdById: user.id,
  });
  revalidatePath(`/visits/${visitId}`);
}

export async function completeVisitAction(formData: FormData) {
  const user = await requireUser();
  const visitId = str(formData, "visitId");
  const visit = await completeVisit(prisma, visitId, user.id, opt(formData, "summary"));
  redirect(`/sites/${visit.siteId}`);
}

// ---------- Vendors & contracts ----------

export async function createVendorAction(formData: FormData) {
  const user = await requireUser();
  const vendor = await prisma.vendor.create({ data: { name: str(formData, "name"), category: opt(formData, "category") } });
  const siteId = opt(formData, "siteId");
  if (siteId) await prisma.vendorSite.create({ data: { vendorId: vendor.id, siteId } });
  await audit(prisma, { actorId: user.id, action: "VENDOR_CREATED", entityType: "VENDOR", entityId: vendor.id });
  revalidatePath("/vendors");
}

export async function recordVendorPerformanceAction(formData: FormData) {
  const user = await requireUser();
  const vendorId = str(formData, "vendorId");
  await recordVendorPerformance(prisma, {
    vendorId,
    siteId: opt(formData, "siteId"),
    type: zVendorPerformanceType.parse(str(formData, "type")),
    content: str(formData, "content"),
    createdById: user.id,
  });
  revalidatePath(`/vendors/${vendorId}`);
}

export async function createContractAction(formData: FormData) {
  const user = await requireUser();
  const contract = await prisma.contract.create({
    data: {
      title: str(formData, "title"),
      vendorId: opt(formData, "vendorId") ?? null,
      description: opt(formData, "description"),
      terms: opt(formData, "terms"),
      startDate: optDate(formData, "startDate"),
      endDate: optDate(formData, "endDate"),
      renewalDate: optDate(formData, "renewalDate"),
      noticeDeadline: optDate(formData, "noticeDeadline"),
      autoRenews: formData.get("autoRenews") === "on",
    },
  });
  const siteId = opt(formData, "siteId");
  if (siteId) await prisma.contractSite.create({ data: { contractId: contract.id, siteId } });
  await audit(prisma, { actorId: user.id, action: "CONTRACT_CREATED", entityType: "CONTRACT", entityId: contract.id });
  await recordActivity(prisma, { userId: user.id, type: "CONTRACT_REVIEWED", summary: `Contract created: ${contract.title}`, entityType: "CONTRACT", entityId: contract.id });
  revalidatePath("/contracts");
}

// ---------- Projects & actions ----------

export async function createProjectAction(formData: FormData) {
  const user = await requireUser();
  const project = await prisma.project.create({
    data: {
      name: str(formData, "name"),
      description: opt(formData, "description"),
      siteId: opt(formData, "siteId") ?? null,
      priority: str(formData, "priority") || "MEDIUM",
      status: str(formData, "status") || "ACTIVE",
      dueDate: optDate(formData, "dueDate"),
      createdById: user.id,
    },
  });
  await recordActivity(prisma, { userId: user.id, type: "PROJECT_UPDATED", summary: `Project created: ${project.name}`, entityType: "PROJECT", entityId: project.id });
  await audit(prisma, { actorId: user.id, action: "PROJECT_CREATED", entityType: "PROJECT", entityId: project.id });
  revalidatePath("/projects");
}

export async function createActionItemAction(formData: FormData) {
  const user = await requireUser();
  await prisma.actionItem.create({
    data: {
      kind: str(formData, "kind") === "DEADLINE" ? "DEADLINE" : "ACTION",
      title: str(formData, "title"),
      details: opt(formData, "details"),
      ownerId: user.id,
      siteId: opt(formData, "siteId") ?? null,
      dueDate: optDate(formData, "dueDate"),
      sourceType: opt(formData, "sourceType"),
      sourceId: opt(formData, "sourceId"),
      createdById: user.id,
    },
  });
  revalidatePath("/actions");
}

export async function completeActionItemAction(formData: FormData) {
  const user = await requireUser();
  const id = str(formData, "id");
  await prisma.actionItem.update({ where: { id }, data: { status: "DONE", completedAt: new Date() } });
  await recordActivity(prisma, { userId: user.id, type: "ACTION_COMPLETED", summary: `Action completed`, entityType: "ACTION", entityId: id });
  revalidatePath("/actions");
  revalidatePath("/briefing");
}

// ---------- Notes, comments, flags ----------

export async function createNoteAction(formData: FormData) {
  const user = await requireUser();
  const note = await prisma.note.create({
    data: {
      title: opt(formData, "title"),
      content: str(formData, "content"),
      visibility: str(formData, "visibility") === "PUBLIC" ? "PUBLIC" : "PRIVATE",
      scope: str(formData, "scope") === "CORPORATE" ? "CORPORATE" : "EXECUTIVE",
      authorId: user.id,
    },
  });
  const linkType = opt(formData, "linkType");
  const linkId = opt(formData, "linkId");
  if (linkType && linkId) {
    await link(prisma, { type: "NOTE", id: note.id }, { type: zEntityType.parse(linkType) as EntityType, id: linkId }, { createdById: user.id });
  }
  await storeUploads(formData, "attachments", user.id, "NOTE", note.id);
  if (note.visibility === "PUBLIC") {
    await deliverMentions(prisma, { text: note.content, actorId: user.id, actorName: user.name, entityType: "NOTE", entityId: note.id, contextTitle: note.title ?? "on a public note" });
  }
  await recordActivity(prisma, { userId: user.id, type: "NOTE_CREATED", summary: `Note created: ${note.title ?? "(untitled)"}`, entityType: "NOTE", entityId: note.id });
  await audit(prisma, { actorId: user.id, action: "NOTE_CREATED", entityType: "NOTE", entityId: note.id, after: { visibility: note.visibility } });
  revalidatePath("/notes");
}

export async function makeNotePublicAction(formData: FormData) {
  const user = await requireUser();
  const id = str(formData, "noteId");
  const note = await prisma.note.findUniqueOrThrow({ where: { id } });
  if (note.authorId !== user.id) throw new Error("Only the author can change note visibility.");
  await prisma.note.update({ where: { id }, data: { visibility: "PUBLIC" } });
  await audit(prisma, { actorId: user.id, action: "NOTE_MADE_PUBLIC", entityType: "NOTE", entityId: id, before: { visibility: "PRIVATE" }, after: { visibility: "PUBLIC" } });
  revalidatePath(`/notes/${id}`);
}

export async function addCommentAction(formData: FormData) {
  const user = await requireUser();
  const entityType = str(formData, "entityType");
  const entityId = str(formData, "entityId");
  const content = str(formData, "content");
  const comment = await prisma.comment.create({
    data: { entityType, entityId, authorId: user.id, content, parentId: opt(formData, "parentId") ?? null },
  });
  await storeUploads(formData, "attachments", user.id, "COMMENT", comment.id);
  await deliverMentions(prisma, { text: content, actorId: user.id, actorName: user.name, entityType, entityId, contextTitle: "in a discussion" });
  revalidatePath(str(formData, "path") || "/");
}

export async function toggleFlagAction(formData: FormData) {
  const user = await requireUser();
  const entityType = str(formData, "entityType");
  const entityId = str(formData, "entityId");
  const label = zFlagLabel.parse(str(formData, "label"));
  const existing = await prisma.flag.findUnique({
    where: { userId_entityType_entityId_label: { userId: user.id, entityType, entityId, label } },
  });
  if (existing) await prisma.flag.delete({ where: { id: existing.id } });
  else await prisma.flag.create({ data: { userId: user.id, entityType, entityId, label } });
  revalidatePath(str(formData, "path") || "/");
}

// ---------- Meetings & Plaud ----------

export async function uploadMeetingAction(formData: FormData) {
  const user = await requireUser();
  const orchestrator = await getOrchestrator(prisma);
  const file = formData.get("file");
  let minutesText = str(formData, "minutesText");
  if (file instanceof File && file.size > 0) {
    minutesText = Buffer.from(await file.arrayBuffer()).toString("utf8");
  }
  if (!minutesText) return;
  const { meetingId } = await uploadMeeting(prisma, orchestrator, {
    title: str(formData, "title") || "Untitled meeting",
    heldAt: optDate(formData, "heldAt"),
    minutesText,
    uploadedById: user.id,
  });
  redirect(`/meetings/${meetingId}`);
}

export async function importPlaudAction(formData: FormData) {
  const user = await requireUser();
  const orchestrator = await getOrchestrator(prisma);
  const file = formData.get("file");
  let transcript = str(formData, "transcript");
  if (file instanceof File && file.size > 0) {
    transcript = Buffer.from(await file.arrayBuffer()).toString("utf8");
  }
  if (!transcript) return;
  const { recordingId } = await importPlaudRecording(prisma, orchestrator, {
    title: str(formData, "title") || "Untitled recording",
    recordedAt: optDate(formData, "recordedAt"),
    transcript,
    uploadedById: user.id,
  });
  redirect(`/plaud/${recordingId}`);
}

export async function uploadPlaudAudioAction(formData: FormData) {
  const user = await requireUser();
  const { importPlaudAudio } = await import("@/lib/services/plaud");
  const maxBytes = await getSetting(prisma, "uploads.maxBytes");
  const files = formData.getAll("audioFiles").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return;
  let lastId = "";
  for (const file of files.slice(0, 10)) {
    const { recordingId } = await importPlaudAudio(prisma, {
      title: opt(formData, "title") || file.name.replace(/\.[^.]+$/, ""),
      recordedAt: optDate(formData, "recordedAt"),
      buffer: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      mimeType: file.type || "audio/mpeg",
      uploadedById: user.id,
      maxBytes,
    });
    lastId = recordingId;
  }
  revalidatePath("/plaud");
  if (files.length === 1) redirect(`/plaud/${lastId}`);
  redirect("/plaud");
}

export async function attachPlaudTranscriptAction(formData: FormData) {
  const user = await requireUser();
  const orchestrator = await getOrchestrator(prisma);
  const { attachPlaudTranscript } = await import("@/lib/services/plaud");
  const recordingId = str(formData, "recordingId");
  const file = formData.get("file");
  let transcript = str(formData, "transcript");
  if (file instanceof File && file.size > 0) {
    transcript = Buffer.from(await file.arrayBuffer()).toString("utf8");
  }
  if (!transcript) return;
  await attachPlaudTranscript(prisma, orchestrator, { recordingId, transcript, userId: user.id });
  revalidatePath(`/plaud/${recordingId}`);
}

// ---------- Memory ----------

export async function commitMemoryAction(formData: FormData) {
  const user = await requireUser();
  await prisma.memoryItem.create({
    data: {
      ownerId: user.id,
      category: str(formData, "category") || "GENERAL",
      content: str(formData, "content"),
      source: opt(formData, "source") ?? "Committed manually",
    },
  });
  await audit(prisma, { actorId: user.id, action: "MEMORY_COMMITTED", entityType: "MEMORY", entityId: user.id });
  revalidatePath("/memory");
}

export async function updateMemoryAction(formData: FormData) {
  const user = await requireUser();
  const id = str(formData, "id");
  const memory = await prisma.memoryItem.findUniqueOrThrow({ where: { id } });
  if (memory.ownerId !== user.id) throw new Error("You can only edit your own memory.");
  await prisma.memoryItem.update({ where: { id }, data: { content: str(formData, "content"), category: str(formData, "category") || memory.category } });
  revalidatePath("/memory");
}

export async function deleteMemoryAction(formData: FormData) {
  const user = await requireUser();
  const id = str(formData, "id");
  const memory = await prisma.memoryItem.findUniqueOrThrow({ where: { id } });
  if (memory.ownerId !== user.id) throw new Error("You can only delete your own memory.");
  await prisma.memoryItem.delete({ where: { id } });
  revalidatePath("/memory");
}

// ---------- Messaging ----------

export async function startConversationAction(formData: FormData) {
  const user = await requireUser();
  const memberIds = formData.getAll("memberIds").map(String).filter(Boolean);
  if (memberIds.length === 0) return;
  let conversationId: string;
  if (memberIds.length === 1) {
    const convo = await getOrCreateDirectConversation(prisma, user.id, memberIds[0]);
    conversationId = convo.id;
  } else {
    const convo = await createGroupConversation(prisma, str(formData, "title") || "Group conversation", [user.id, ...memberIds]);
    conversationId = convo.id;
  }
  redirect(`/messages/${conversationId}`);
}

export async function sendMessageAction(formData: FormData) {
  const user = await requireUser();
  const conversationId = str(formData, "conversationId");
  await sendMessage(prisma, {
    conversationId,
    senderId: user.id,
    content: str(formData, "content"),
    sharedEntityType: opt(formData, "sharedEntityType"),
    sharedEntityId: opt(formData, "sharedEntityId"),
  });
  revalidatePath(`/messages/${conversationId}`);
}

export async function markConversationReadAction(formData: FormData) {
  const user = await requireUser();
  await markRead(prisma, str(formData, "conversationId"), user.id);
  revalidatePath("/messages");
}

// ---------- Chief of Staff ----------

export async function askChiefAction(formData: FormData) {
  const user = await requireUser();
  const orchestrator = await getOrchestrator(prisma);
  const question = str(formData, "question");
  if (!question) return;
  const threadId = opt(formData, "threadId") ?? null;
  const result = await askChief(prisma, orchestrator, user.id, threadId, question);
  await recordActivity(prisma, { userId: user.id, type: "AI_INVESTIGATION", summary: `Asked Chief of Staff: ${question.slice(0, 80)}`, entityType: "USER", entityId: user.id });
  redirect(`/chief?thread=${result.threadId}`);
}

// ---------- Notifications ----------

export async function markNotificationReadAction(formData: FormData) {
  const user = await requireUser();
  const id = str(formData, "id");
  await prisma.notification.updateMany({ where: { id, userId: user.id }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
}

export async function markAllNotificationsReadAction() {
  const user = await requireUser();
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
}

// ---------- Attention flag (@ directed) ----------

export async function directAttentionAction(formData: FormData) {
  const user = await requireUser();
  const targetUserId = str(formData, "targetUserId");
  const entityType = str(formData, "entityType");
  const entityId = str(formData, "entityId");
  await notify(prisma, {
    userId: targetUserId,
    type: "ATTENTION",
    title: `${user.name} directed your attention`,
    body: opt(formData, "message"),
    entityType,
    entityId,
  });
  revalidatePath(str(formData, "path") || "/");
}

// ---------- Admin ----------

export async function updateSettingAction(formData: FormData) {
  const admin = await requireAdmin();
  const key = str(formData, "key") as keyof SettingsShape;
  const rawValue = str(formData, "value");
  let value: unknown;
  try {
    value = JSON.parse(rawValue);
  } catch {
    value = rawValue;
  }
  await setSetting(prisma, key, value as never, admin.id);
  await audit(prisma, { actorId: admin.id, action: "SETTING_UPDATED", entityType: "SETTING", entityId: key, after: value });
  revalidatePath("/admin");
}

export async function runHealthCheckAction() {
  await requireAdmin();
  const orchestrator = await getOrchestrator(prisma);
  await orchestrator.healthCheckAll();
  // Providers may have just recovered — drain any outage-queued AI work.
  if (orchestrator.aiAvailable()) {
    await drainAiQueue(prisma, orchestrator);
  }
  revalidatePath("/admin");
}

export async function processAiQueueAction() {
  await requireAdmin();
  const orchestrator = await getOrchestrator(prisma);
  await drainAiQueue(prisma, orchestrator);
  revalidatePath("/admin");
}


// ---------- Dashboard layout ----------

export async function saveDashboardLayoutAction(formData: FormData) {
  const user = await requireUser();
  const order = str(formData, "order")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const hidden = formData.getAll("hidden").map(String);
  const existing = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  let prefs: Record<string, unknown> = {};
  try {
    prefs = JSON.parse(existing.preferencesJson ?? "{}");
  } catch {
    prefs = {};
  }
  prefs.dashboard = { order, hidden };
  await prisma.user.update({ where: { id: user.id }, data: { preferencesJson: JSON.stringify(prefs) } });
  revalidatePath("/dashboard");
}

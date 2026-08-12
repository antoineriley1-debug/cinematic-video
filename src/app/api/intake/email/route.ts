// METHOD B — dedicated email intake endpoint. Inbound-mail services
// (SES → SNS, Mailgun routes, CloudMailin, Postmark inbound, etc.) forward
// each message here as raw RFC-822. The endpoint is disabled until
// EMAIL_INTAKE_TOKEN is set, and every request must carry that token.
// This is still intentional submission: only mail explicitly forwarded to
// the intake address ever reaches the platform — there is no mailbox sync.
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { getOrchestrator } from "@/lib/ai/orchestrator";
import { ingestEmail } from "@/lib/services/emails";
import { parseEml } from "@/lib/email/parse";
import { audit } from "@/lib/audit";

function tokenOk(req: NextRequest): boolean {
  const expected = process.env.EMAIL_INTAKE_TOKEN;
  if (!expected) return false;
  const provided =
    req.headers.get("x-intake-token") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

async function resolveOwnerId(rawSource: string): Promise<string | null> {
  // Attribute the email to the forwarding executive when the sender address
  // matches a user; otherwise the configured default owner; otherwise the
  // first active admin.
  const parsed = parseEml(rawSource);
  if (parsed.fromAddress) {
    const sender = await prisma.user.findUnique({ where: { email: parsed.fromAddress } });
    if (sender?.active) return sender.id;
  }
  const fallbackEmail = process.env.EMAIL_INTAKE_DEFAULT_OWNER?.toLowerCase().trim();
  if (fallbackEmail) {
    const fallback = await prisma.user.findUnique({ where: { email: fallbackEmail } });
    if (fallback?.active) return fallback.id;
  }
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN", active: true } });
  return admin?.id ?? null;
}

export async function POST(req: NextRequest) {
  if (!process.env.EMAIL_INTAKE_TOKEN) {
    return NextResponse.json({ error: "Email intake is not configured." }, { status: 503 });
  }
  if (!tokenOk(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawSource: string;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as { raw?: string } | null;
    rawSource = body?.raw ?? "";
  } else {
    rawSource = await req.text();
  }
  if (!rawSource || rawSource.length < 10) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }
  if (rawSource.length > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Message too large" }, { status: 413 });
  }

  const ownerId = await resolveOwnerId(rawSource);
  if (!ownerId) {
    return NextResponse.json({ error: "No intake owner resolvable" }, { status: 500 });
  }

  const orchestrator = await getOrchestrator(prisma);
  const result = await ingestEmail(prisma, orchestrator, { rawSource, uploadedById: ownerId });
  await audit(prisma, {
    actorId: ownerId,
    action: "EMAIL_INTAKE_RECEIVED",
    entityType: "EMAIL",
    entityId: result.emailId,
    after: { duplicate: result.duplicate, mode: result.mode },
    source: "API",
  });
  return NextResponse.json(
    { emailId: result.emailId, duplicate: result.duplicate, mode: result.mode },
    { status: result.duplicate ? 200 : 201 },
  );
}

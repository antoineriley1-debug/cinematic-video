// Signature-gated public file access — used to hand one specific audio file
// to Plaud's transcription cloud for a limited time. No session required;
// the HMAC signature (see lib/signedUrl.ts) authorizes exactly one file
// until the embedded expiry.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readFileBuffer } from "@/lib/storage";
import { verifySignedFile } from "@/lib/signedUrl";
import { isRateLimited } from "@/lib/ratelimit";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(`pubfile:${ip}`, 60)) {
    return new NextResponse("Too many requests", { status: 429, headers: { "retry-after": "60" } });
  }
  const exp = req.nextUrl.searchParams.get("exp");
  const sig = req.nextUrl.searchParams.get("sig");
  if (!verifySignedFile(id, exp, sig)) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
  }
  const result = await readFileBuffer(prisma, id);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      "content-type": result.file.mimeType,
      "content-disposition": `inline; filename="${result.file.filename.replace(/"/g, "")}"`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}

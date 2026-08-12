// Narrates a training module (or the welcome presentation) in a natural
// professional voice via the configured provider. Server-side credentials;
// 404s cleanly when no provider is set so the UI simply hides the players.
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { isRateLimited, LIMITS } from "@/lib/ratelimit";
import { voiceConfigured, synthesizeSpeech } from "@/lib/voice";
import { narrationTextFor } from "@/lib/training";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!voiceConfigured()) {
    return NextResponse.json({ error: "No voice provider configured" }, { status: 404 });
  }
  if (isRateLimited(`api:${user.id}`, LIMITS.api)) {
    return new NextResponse("Too many requests", { status: 429, headers: { "retry-after": "60" } });
  }
  const { slug } = await ctx.params;
  const text = narrationTextFor(slug);
  if (!text) return NextResponse.json({ error: "Unknown module" }, { status: 404 });

  try {
    const result = await synthesizeSpeech({ text });
    return new NextResponse(new Uint8Array(result.audio), {
      headers: {
        "content-type": result.mimeType,
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Voice synthesis failed" },
      { status: 502 },
    );
  }
}

// Natural-voice abstraction. No vendor hard-coding: VOICE_PROVIDER selects
// the adapter, credentials stay server-side, and executives pick a profile
// via VOICE_ID (or their user voiceProfile). Currently shipped adapter:
// ElevenLabs. Adding a vendor = one synthesize() implementation.
import "server-only";

export type VoiceRequest = {
  text: string;
  /** Provider-specific voice/profile id; falls back to VOICE_ID env. */
  voiceId?: string;
};

export type VoiceResult = {
  audio: Buffer;
  mimeType: string;
};

export function voiceConfigured(): boolean {
  return Boolean(process.env.VOICE_PROVIDER && process.env.VOICE_API_KEY);
}

async function synthesizeElevenLabs(req: VoiceRequest, fetchImpl: typeof fetch): Promise<VoiceResult> {
  const voiceId = req.voiceId || process.env.VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
  const res = await fetchImpl(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.VOICE_API_KEY!,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text: req.text.slice(0, 4800),
        model_id: process.env.VOICE_MODEL || "eleven_multilingual_v2",
      }),
      signal: AbortSignal.timeout(60000),
    },
  );
  if (!res.ok) throw new Error(`Voice provider returned HTTP ${res.status}`);
  return { audio: Buffer.from(await res.arrayBuffer()), mimeType: "audio/mpeg" };
}

export async function synthesizeSpeech(req: VoiceRequest, fetchImpl: typeof fetch = fetch): Promise<VoiceResult> {
  if (!voiceConfigured()) throw new Error("No voice provider configured (VOICE_PROVIDER / VOICE_API_KEY).");
  const provider = (process.env.VOICE_PROVIDER ?? "").toLowerCase();
  switch (provider) {
    case "elevenlabs":
      return synthesizeElevenLabs(req, fetchImpl);
    default:
      throw new Error(`Unknown VOICE_PROVIDER "${provider}" — supported: elevenlabs.`);
  }
}

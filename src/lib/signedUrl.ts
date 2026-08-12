// Short-lived HMAC-signed public URLs for stored files, so external services
// (e.g. Plaud's transcription cloud) can fetch one specific file without a
// session. Signature covers file id + expiry; SESSION_SECRET is the key.
import crypto from "node:crypto";

function hmac(value: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for signed URLs");
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export function makeSignedFilePath(fileId: string, ttlMs = 60 * 60 * 1000): string {
  const exp = Date.now() + ttlMs;
  const sig = hmac(`${fileId}.${exp}`);
  return `/api/public-files/${fileId}?exp=${exp}&sig=${sig}`;
}

export function verifySignedFile(fileId: string, exp: string | null, sig: string | null): boolean {
  if (!exp || !sig) return false;
  const expNum = parseInt(exp, 10);
  if (!Number.isFinite(expNum) || expNum < Date.now()) return false;
  const expected = hmac(`${fileId}.${expNum}`);
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

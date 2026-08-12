// Object storage abstraction. Local filesystem adapter by default;
// S3-compatible storage is a drop-in replacement behind the same interface
// (see docs/DEPLOYMENT.md). Files are content-addressed by sha256 so the
// same object is never stored twice — duplicates become references.
import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Db } from "./db";

const ALLOWED_MIME_PREFIXES = [
  "text/",
  "image/",
  "audio/",
  "video/",
  "application/pdf",
  "application/json",
  "application/vnd",
  "application/msword",
  "application/zip",
  "application/octet-stream",
  "message/rfc822",
];

export function validateUpload(filename: string, mimeType: string, size: number, maxBytes: number) {
  if (size <= 0) throw new Error("Empty file.");
  if (size > maxBytes) throw new Error(`File exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB upload limit.`);
  if (!ALLOWED_MIME_PREFIXES.some((p) => mimeType.startsWith(p))) {
    throw new Error(`File type ${mimeType} is not allowed.`);
  }
  if (/[/\\]|\.\./.test(filename)) throw new Error("Invalid filename.");
}

function storageRoot(): string {
  return path.resolve(process.env.STORAGE_DIR || "./storage");
}

export async function storeFile(db: Db, opts: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  ownerId: string;
  entityType?: string;
  entityId?: string;
  maxBytes?: number;
}) {
  const maxBytes = opts.maxBytes ?? 50 * 1024 * 1024;
  validateUpload(opts.filename, opts.mimeType, opts.buffer.length, maxBytes);
  const sha256 = crypto.createHash("sha256").update(opts.buffer).digest("hex");

  // Deduplicate the stored object; keep a per-context reference row.
  const existing = await db.storedFile.findFirst({ where: { sha256 } });
  let key: string;
  if (existing) {
    key = existing.path;
  } else {
    key = path.join(sha256.slice(0, 2), sha256);
    const full = path.join(storageRoot(), key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, opts.buffer);
  }

  return db.storedFile.create({
    data: {
      filename: opts.filename,
      mimeType: opts.mimeType,
      size: opts.buffer.length,
      sha256,
      path: key,
      ownerId: opts.ownerId,
      entityType: opts.entityType ?? null,
      entityId: opts.entityId ?? null,
    },
  });
}

export async function readFileBuffer(db: Db, fileId: string): Promise<{ buffer: Buffer; file: { filename: string; mimeType: string } } | null> {
  const file = await db.storedFile.findUnique({ where: { id: fileId } });
  if (!file) return null;
  const full = path.join(storageRoot(), file.path);
  const buffer = await fs.readFile(full);
  return { buffer, file: { filename: file.filename, mimeType: file.mimeType } };
}

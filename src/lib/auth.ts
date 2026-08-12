import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { audit } from "./audit";
import { isLoginThrottled, recordFailedLogin } from "./loginThrottle";

const SESSION_COOKIE = "ceos_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12h

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (>=32 chars)");
  return s;
}

function sign(value: string): string {
  const mac = crypto.createHmac("sha256", secret()).update(value).digest("hex");
  return `${value}.${mac}`;
}

function verify(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx < 0) return null;
  const value = signed.slice(0, idx);
  const mac = signed.slice(idx + 1);
  const expected = crypto.createHmac("sha256", secret()).update(value).digest("hex");
  if (mac.length !== expected.length) return null;
  return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected)) ? value : null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function createSession(userId: string): Promise<void> {
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.session.create({
    data: { token, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, sign(token), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  if (await isLoginThrottled(prisma, email)) {
    return { ok: false, error: "Too many failed attempts. Try again later." };
  }
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  // Constant-shape comparison: always run bcrypt even for unknown users.
  const hash = user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
  const ok = await bcrypt.compare(password, hash);
  if (!user || !user.active || !ok) {
    await recordFailedLogin(prisma, email);
    return { ok: false, error: "Invalid email or password." };
  }
  await createSession(user.id);
  await audit(prisma, { actorId: user.id, action: "LOGIN", entityType: "USER", entityId: user.id });
  return { ok: true };
}

export async function logout(): Promise<void> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (raw) {
    const token = verify(raw);
    if (token) await prisma.session.deleteMany({ where: { token } });
  }
  store.delete(SESSION_COOKIE);
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  title: string | null;
};

export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const token = verify(raw);
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { token }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  const { id, email, name, role, title } = session.user;
  return { id, email, name, role, title };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/briefing");
  return user;
}

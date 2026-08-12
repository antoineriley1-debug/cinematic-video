// Durable (DB-backed) login attempt throttling. Failed attempts are recorded
// as LOGIN_FAILED audit rows keyed by the attempted email; once the
// configured failure count is reached inside the window, further attempts
// for that email are refused until the window rolls over.
import type { Db } from "./db";
import { getSetting } from "./settings";

export async function isLoginThrottled(db: Db, email: string): Promise<boolean> {
  const [maxFailures, windowMinutes] = await Promise.all([
    getSetting(db, "security.loginMaxFailures"),
    getSetting(db, "security.loginWindowMinutes"),
  ]);
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  const failures = await db.auditLog.count({
    where: {
      action: "LOGIN_FAILED",
      entityType: "USER",
      entityId: email.toLowerCase().trim(),
      createdAt: { gte: since },
    },
  });
  return failures >= maxFailures;
}

export async function recordFailedLogin(db: Db, email: string): Promise<void> {
  await db.auditLog.create({
    data: {
      action: "LOGIN_FAILED",
      entityType: "USER",
      entityId: email.toLowerCase().trim(),
      source: "SYSTEM",
    },
  });
}

// SMTP delivery for optional email copies of notifications (mentions,
// attention flags, alerts). Activates when SMTP_* env vars are present;
// in-app notifications never depend on it. Failures are swallowed after
// logging a provider event — email is a convenience channel, not the
// system of record.
import nodemailer, { type Transporter } from "nodemailer";
import type { Db } from "./db";

let transporter: Transporter | null = null;
let testTransport: Transporter | null = null;

/** Test hook: inject a fake transporter (pass null to restore real SMTP). */
export function __setTransportForTests(t: Transporter | null): void {
  testTransport = t;
  transporter = null;
}

export function mailEnabled(): boolean {
  return Boolean(testTransport || (process.env.SMTP_HOST && process.env.SMTP_FROM));
}

function getTransporter(): Transporter {
  if (testTransport) return testTransport;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT ?? "587", 10),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return transporter;
}

export async function sendNotificationEmail(
  db: Db,
  opts: { to: string; title: string; body?: string; href?: string },
): Promise<boolean> {
  if (!mailEnabled()) return false;
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM ?? "executive-os@localhost",
      to: opts.to,
      subject: `[Crothall Executive OS] ${opts.title}`,
      text: [opts.title, "", opts.body ?? "", opts.href ? `\nOpen in Executive OS: ${opts.href}` : ""]
        .join("\n")
        .trim(),
    });
    return true;
  } catch (err) {
    await db.providerEvent
      .create({
        data: { provider: "smtp", event: "HEALTH_FAIL", detail: err instanceof Error ? err.message : String(err) },
      })
      .catch(() => {});
    return false;
  }
}

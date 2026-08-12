# Deployment & Access

## How to access the app

The app is a standard Next.js server — it runs anywhere Node 22 runs. Three
ways in, from quickest to most permanent:

### Option 1 — Run it on your own computer (5 minutes, local only)
```bash
git clone https://github.com/antoineriley1-debug/cinematic-video
cd cinematic-video && git checkout claude/crothall-executive-os-wflc5u
npm ci
cp .env.example .env        # set SESSION_SECRET; paste AI keys to go live
npx prisma db push
npm run db:seed             # prints demo logins
npm run dev                 # → http://localhost:3000
```
Login: `antoine@crothall-demo.local` / `crothall-demo-2026` (admin).

### Option 2 — Deploy to Render for a public HTTPS URL (~10 minutes)
The repo ships a blueprint (`render.yaml`) that provisions the web service
(with automatic TLS), a managed PostgreSQL database, and a persistent disk
for file storage in one step:
1. Sign in at **render.com** → **New → Blueprint**.
2. Connect the GitHub repo `antoineriley1-debug/cinematic-video`, pick
   branch `claude/crothall-executive-os-wflc5u`, and Apply.
3. In the service's **Environment** tab, paste your keys
   (`ANTHROPIC_API_KEY`, and any of `GEMINI_API_KEY`, `PLAUD_API_KEY`,
   `EMAIL_INTAKE_TOKEN`, `SMTP_*`, `VOICE_*`). `SESSION_SECRET` and
   `DATABASE_URL` are generated automatically.
4. After the first deploy, open the service **Shell** and run
   `npm run db:seed`, then log in at your
   `https://crothall-executive-os-….onrender.com` URL and change the demo
   passwords.

This closes the "production Postgres + TLS" item in one move: Render
terminates TLS and the blueprint's build swaps Prisma to the generated
PostgreSQL schema (`scripts/make-pg-schema.mjs`).

### Option 3 — Any other Node host (Railway, Fly, a VPS…)
```bash
npm ci
node scripts/make-pg-schema.mjs
npx prisma generate --schema=prisma/schema.postgres.prisma
npx prisma db push --schema=prisma/schema.postgres.prisma
npm run build && npm start        # behind your TLS reverse proxy
```

## Environment variables (see .env.example for the full annotated list)
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite file (dev) or PostgreSQL URL (prod) |
| `SESSION_SECRET` | ≥32-char random hex; rotate to invalidate sessions |
| `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `OPENAI_API_KEY` | live AI + failover (any subset) |
| `PLAUD_API_KEY` (+ `PLAUD_API_BASE`, `PLAUD_API_LIST_PATH`) | Plaud recording sync |
| `EMAIL_INTAKE_TOKEN` (+ `EMAIL_INTAKE_DEFAULT_OWNER`) | Method-B inbound mail endpoint |
| `SMTP_HOST/PORT/USER/PASS/FROM`, `APP_BASE_URL` | email copies of mentions/alerts |
| `VOICE_PROVIDER` + `VOICE_API_KEY` (+ `VOICE_ID`, `VOICE_MODEL`) | training narration (elevenlabs) |
| `STORAGE_DIR` | object-storage root (persistent disk in prod) |

## Wiring inbound mail (Method B)
The endpoint is live at `POST /api/intake/email` and disabled until
`EMAIL_INTAKE_TOKEN` is set. Point any inbound-mail service at it:
1. Generate a token: `openssl rand -hex 24` → set `EMAIL_INTAKE_TOKEN`.
2. Buy/choose the intake address (e.g. `intake@yourdomain.com`) with any
   inbound-mail provider: **Mailgun Routes**, **CloudMailin**, **Postmark
   inbound**, or **SES → SNS → HTTPS**.
3. Configure the provider to POST the **raw MIME message** to
   `https://<your-app>/api/intake/email` with header
   `x-intake-token: <token>`.
4. Emails from addresses that match an executive account are filed under
   that executive; unknown senders go to `EMAIL_INTAKE_DEFAULT_OWNER`
   (or the first admin). Duplicates are detected exactly like drag-and-drop.

## Wiring SMTP (email copies of notifications)
Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (any
provider: SES SMTP, Mailgun, Postmark, Office 365). Mentions, attention
flags, and alerts then also go to the executive's inbox; in-app delivery
never depends on it, and SMTP failures are logged, never fatal.

## Wiring voice narration
Set `VOICE_PROVIDER=elevenlabs` and `VOICE_API_KEY` (keys at
elevenlabs.io). The Training Center then shows audio players that narrate
the welcome presentation and every workflow guide in a natural professional
voice; `VOICE_ID` selects the voice profile. Credentials never reach the
browser — synthesis happens server-side at `/api/voice/<module>`.

## Backup & recovery
- **Database**: Render/managed-Postgres automated snapshots, or `pg_dump`
  on a schedule; SQLite dev = copy the `.db` file cold.
- **Object storage**: `STORAGE_DIR` is content-addressed (sha256 paths) —
  disk snapshots or rsync/S3 versioning; re-uploads are idempotent.
- **Recovery drill**: restore DB + storage dir, set env, `npm start`;
  rotating `SESSION_SECRET` invalidates all sessions.

## Health & monitoring
- `GET /api/health` — liveness (used by Render's health check).
- Admin Console → AI Providers: health, failover events, queued-work drain.

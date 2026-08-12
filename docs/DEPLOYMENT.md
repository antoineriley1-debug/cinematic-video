# Deployment

## Requirements
- Node 22+, a persistent filesystem or S3-compatible storage, PostgreSQL 15+
  (production) or SQLite (development/demo).

## Environment (see .env.example)
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `file:./dev.db` (dev) or `postgresql://…` (prod) |
| `SESSION_SECRET` | ≥32-char random hex; rotate to invalidate all sessions |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | activates live AI + failover |
| `ANTHROPIC_MODEL` / `OPENAI_MODEL` | optional model overrides |
| `STORAGE_DIR` | object-storage root (local adapter) |
| `EMAIL_INTAKE_ADDRESS` | Method B intake (requires inbound-mail infra) |
| `VOICE_PROVIDER` / `VOICE_API_KEY` | voice/training narration |

## Steps
```bash
npm ci
# PostgreSQL: change prisma/schema.prisma datasource provider to "postgresql"
npx prisma db push          # or prisma migrate deploy once migrations are generated
npm run db:seed             # demo data only — skip in production
npm run build
npm start                   # or a process manager / platform runtime
```
Serve behind TLS (reverse proxy or platform). Set `NODE_ENV=production` so
session cookies are Secure.

## PostgreSQL migration notes
The schema avoids SQLite-only features; switching means changing the
datasource provider and generating migrations (`prisma migrate dev` in a
staging environment, `migrate deploy` in production). JSON-in-string columns
work unchanged; they can be upgraded to native `Json` columns later.

## Backup & recovery
- **Database**: platform-native automated backups (e.g. RDS snapshots) or
  `pg_dump` on a schedule; SQLite dev = copy the `.db` file cold.
- **Object storage**: `STORAGE_DIR` is content-addressed (sha256 paths) —
  rsync/S3 versioning is sufficient; re-uploading identical content is
  idempotent.
- **Recovery drill**: restore DB snapshot + storage dir, set env, `npm start`;
  sessions invalidate automatically if `SESSION_SECRET` changed.

## Health & monitoring
- `GET /api/health` — liveness (DB reachability).
- Admin Console → AI Providers — provider health + manual probe; provider
  events table records failovers/outages/recoveries.

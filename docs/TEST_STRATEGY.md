# Test Strategy

## Layers
1. **Unit** — pure logic: emergency engine parsing/classification, email
   parsing (RFC-822, multipart, quoted-printable UTF-8, pasted text,
   malformed input), personality profiles, countdown math.
2. **Integration (service-level)** — real Prisma against a throwaway SQLite
   DB (`tests/setup.ts` recreates `prisma/test.db` per test file): email
   ingestion/dedup/suggestion links, infraction thresholds (default and
   admin-reconfigured), pattern detection, contract watch + per-user acks,
   briefing personalization + ack semantics, messaging authorization +
   unread + conversation briefs, search authorization.
3. **Failure/edge** — provider failover, total outage (queueing, no data
   loss, honest labeling), unconfigured providers, malformed emails,
   duplicate ingestion, non-participant message attempts, cross-user privacy.
4. **Global integration** — `tests/integration.test.ts` runs the Master Spec
   §44 sixteen-step chain end to end.
5. **Browser E2E** — Playwright + Chromium (`e2e/`, 16 tests, `npm run
   test:e2e`): isolated seeded database (`prisma/e2e.db`) recreated per run
   on port 3100; one UI login reused via storageState (respects the login
   rate limiter); covers the executive golden path end to end (login,
   briefing + acknowledgement, site visit, infraction, email → link
   confirmation → corrective draft, meetings, messaging, Chief of Staff
   with sources, search, export authz).
6. **Performance** — `scripts/perf.mjs` (rerunnable, exits nonzero on budget
   failure) against a scratch DB copy on port 3200; evidence in
   `docs/PERFORMANCE.md`.

## Running
```
npm test          # vitest, 63 tests, no network required
npm run test:e2e  # Playwright (builds nothing; needs a prior next build)
npm run build     # production build gate
```
AI-dependent behavior is tested through `MockProvider` — deterministic,
controllable outage simulation. E2E asserts Emergency-Intelligence-Mode
output (no keys configured); with live keys the emails/meetings/chief specs
need AI-mode assertion variants.

## Gaps / next steps
- Live-provider AI evals + real failover drill (BLOCKED_EXTERNAL on keys).
- Dedicated tests for the 8 remaining IMPLEMENTED register rows.

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
5. **Smoke** — production build + authenticated render of all 25 routes +
   export downloads (performed manually via curl; candidates for Playwright).

## Running
```
npm test          # vitest, 47 tests, no network required
npm run build     # production build gate
```
AI-dependent behavior is tested through `MockProvider` — deterministic,
controllable outage simulation. Live-provider evals require keys
(BLOCKED_EXTERNAL).

## Gaps / next steps
- Playwright E2E over the real UI (login → briefing → email upload → draft).
- Queue-drain worker tests once R8.7 lands.
- Load/perf pass (Master Spec phase 27) not yet run.

# BUILD_STATUS

_Last updated: 2026-08-12 (hardening pass)_

## Current Phase
All 14 previously open IN_PROGRESS / NOT_STARTED requirements are closed
(11 newly VERIFIED with tests or live evidence, 3 IMPLEMENTED with smoke
evidence). Remaining gate items are listed below.

## Completed (this pass)
- **AI queue drain worker** — outage-queued email/meeting analysis is
  re-processed automatically on provider recovery (health check, admin
  button, opportunistic layout drain). Tested end to end.
- **Real-time push** — SSE stream (`/api/stream`) + client auto-refresh;
  a live insert of a notification was observed pushing a refresh event.
- **Rate limiting + login throttling** — application-layer sliding-window
  limiter (login per-IP, API routes per-user; live-verified 429 after the
  240th request) plus a durable DB-backed per-email failed-login throttle.
  Note: the Next 16 proxy sandbox does not retain state between requests,
  so limiting lives in the Node app layer by design.
- **Email attachment parsing** — MIME attachments extracted, stored
  content-addressed, linked to the email, downloadable from the email page.
- **Note/comment attachments** — upload inputs wired to the shared storage
  layer; download chips rendered.
- **Configurable dashboard** — per-user panel order/visibility with an
  on-page editor (`User.preferencesJson`).
- **Admin-editable personality rules** — `personalities.overrides` setting
  replaces code-defined rules per profile; drafting prompts proven to use
  overrides.
- **Infraction-alert acknowledgement rule** — briefing honors the admin
  `requireAcknowledgement` flag.
- **Natural-language search** — multi-term tokenization, any-term matching,
  phrase-first ranking, per-type result caps.
- **Contextual help** — "How do I use this?" links on 20 screens anchored
  into the Training Center.
- **Project & contract report exports** — new endpoints + UI buttons.
- **CI pipeline** — GitHub Actions: tests, production build, and
  `npm audit --audit-level=high`. The audit surfaced real high-severity
  advisories in Next 16.2.6; **upgraded to Next 16.3.0 → 0 vulnerabilities**.

## Tests Passing
63/63 (16 added this pass: queue drain ×4, rate limiter, login throttle ×2,
personality overrides, NL search ×3, infraction ack rule, attachments ×2,
project/contract reports ×2). `next build` clean on Next 16.3.0; all pages
render 200 live; SSE push, API 429, exports, anchors verified live.

## Tests Failing
None.

## Requirements Verified / Remaining
From docs/REQUIREMENTS_TRACEABILITY.md (87 tracked rows):
**63 VERIFIED · 16 IMPLEMENTED · 1 IN_PROGRESS (the release gate itself) · 0 NOT_STARTED · 7 BLOCKED_EXTERNAL**

## Security Findings
No known high-severity findings open. `npm audit`: 0 vulnerabilities.
Rate limiting and login throttling active. Multi-instance deployments still
need a shared limiter store or platform WAF (documented in docs/SECURITY.md).

## External Blockers (unchanged — need credentials/infrastructure)
AI provider keys · Method-B email intake infrastructure · Plaud API
credentials · SMTP for email notification delivery · voice provider ·
production TLS/at-rest encryption · production PostgreSQL.

## Release Gate
**NOT PASSED** — remaining items are narrower now:
1. Playwright browser E2E of the golden path (service-level integration is
   tested; a real-browser pass is not).
2. Performance/load pass (Master Spec phase 27).
3. Live-provider AI evaluations + failover drill against real APIs
   (requires keys — BLOCKED_EXTERNAL).
4. First green run of the CI pipeline on GitHub (triggers on this push).

## Next Action
1. Watch the CI run triggered by this push.
2. Playwright E2E: login → briefing → email upload → draft → ack.
3. On receipt of AI keys: live failover drill + AI output evals.

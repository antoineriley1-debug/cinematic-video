// Performance / reliability pass for Crothall Executive OS.
//
// Plain Node (no extra deps): fetch + performance.now(). @prisma/client is
// used only to mint a session row and to insert probe data — it is already a
// project dependency.
//
// Usage (from repo root, against a *scratch* database — never dev.db):
//   cp prisma/dev.db prisma/perf.db
//   env DATABASE_URL="file:./perf.db" SESSION_SECRET="<same as server>" \
//     STORAGE_DIR="./storage-perf" npx next start -p 3200 &
//   env DATABASE_URL="file:./perf.db" SESSION_SECRET="<same as server>" \
//     BASE_URL="http://localhost:3200" node scripts/perf.mjs
//
// The script:
//   1. Benchmarks 10 page routes: 3 warmups + 30 sequential authed requests.
//   2. Runs 20-way concurrency against /briefing then /dashboard.
//   3. Measures the heavier read /api/export/briefing 10x (API routes are
//      rate-limited 240 req/min/user; total API usage here stays ~11 calls).
//   4. Inserts 200 ActivityEvent + 100 Note rows for the admin user, then
//      re-measures /briefing and /search?q=note under data growth.
//   5. Prints markdown tables to stdout and writes docs/PERFORMANCE.md with
//      pass/fail against fixed budgets (numbers reported honestly).

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { PrismaClient } = require("@prisma/client");

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3200";
const SECRET = process.env.SESSION_SECRET;
if (!SECRET || SECRET.length < 32) {
  console.error("SESSION_SECRET must be set (>=32 chars) and match the server's.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL must be set and point at the scratch perf DB.");
  process.exit(1);
}

const ADMIN_EMAIL = "antoine@crothall-demo.local";
const PAGES = [
  "/briefing",
  "/dashboard",
  "/sites",
  "/directors",
  "/vendors",
  "/contracts",
  "/emails",
  "/search?q=fire",
  "/calendar",
  "/notes",
];

const BUDGETS = {
  pageP95Ms: 1500, // every page at seed scale
  briefingGrowthP95Ms: 2500, // /briefing after data growth
};

const prisma = new PrismaClient();

// ---------- helpers ----------

function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
  return { p50: q(0.5), p95: q(0.95), max: s[s.length - 1], n: s.length };
}

const ms = (v) => v.toFixed(1);

async function makeCookie() {
  const user = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!user) throw new Error(`admin user ${ADMIN_EMAIL} not found in DATABASE_URL DB`);
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.session.create({
    data: { token, userId: user.id, expiresAt: new Date(Date.now() + 12 * 3600 * 1000) },
  });
  const mac = crypto.createHmac("sha256", SECRET).update(token).digest("hex");
  return { cookie: `ceos_session=${token}.${mac}`, userId: user.id };
}

async function timedGet(pathname, cookie) {
  const t0 = performance.now();
  const res = await fetch(BASE_URL + pathname, {
    headers: { cookie },
    redirect: "manual", // a 307 to /login means auth failed — count it, don't follow
  });
  await res.arrayBuffer(); // include full body transfer in the timing
  return { ms: performance.now() - t0, status: res.status };
}

async function benchSequential(pathname, cookie, { warmups = 3, iterations = 30 } = {}) {
  for (let i = 0; i < warmups; i++) await timedGet(pathname, cookie);
  const times = [];
  const statuses = {};
  for (let i = 0; i < iterations; i++) {
    const r = await timedGet(pathname, cookie);
    times.push(r.ms);
    statuses[r.status] = (statuses[r.status] ?? 0) + 1;
  }
  return { path: pathname, ...stats(times), statuses };
}

async function benchConcurrent(pathname, cookie, n = 20) {
  const t0 = performance.now();
  const results = await Promise.all(Array.from({ length: n }, () => timedGet(pathname, cookie)));
  const wallMs = performance.now() - t0;
  const statuses = {};
  for (const r of results) statuses[r.status] = (statuses[r.status] ?? 0) + 1;
  return { path: pathname, n, wallMs, ...stats(results.map((r) => r.ms)), statuses };
}

const fmtStatuses = (st) =>
  Object.entries(st)
    .map(([code, count]) => `${code}x${count}`)
    .join(", ");

function pageTable(rows) {
  const lines = [
    "| Route | n | p50 (ms) | p95 (ms) | max (ms) | Statuses |",
    "|---|---|---|---|---|---|",
  ];
  for (const r of rows) {
    lines.push(`| \`${r.path}\` | ${r.n} | ${ms(r.p50)} | ${ms(r.p95)} | ${ms(r.max)} | ${fmtStatuses(r.statuses)} |`);
  }
  return lines.join("\n");
}

// ---------- main ----------

async function main() {
  const { cookie, userId } = await makeCookie();

  // Sanity check before burning 300+ requests.
  const probe = await timedGet("/briefing", cookie);
  if (probe.status !== 200) {
    throw new Error(`auth sanity check failed: GET /briefing -> ${probe.status} (cookie/secret mismatch?)`);
  }

  // 1. Page latency at seed scale.
  console.error("[1/4] Page latency benchmark (3 warmups + 30 iterations per route)...");
  const pageResults = [];
  for (const p of PAGES) {
    const r = await benchSequential(p, cookie);
    console.error(`  ${p}  p50=${ms(r.p50)} p95=${ms(r.p95)} max=${ms(r.max)} [${fmtStatuses(r.statuses)}]`);
    pageResults.push(r);
  }

  // 2. Concurrency.
  console.error("[2/4] Concurrency test (20 parallel requests)...");
  const concResults = [];
  for (const p of ["/briefing", "/dashboard"]) {
    const r = await benchConcurrent(p, cookie, 20);
    console.error(`  ${p}  wall=${ms(r.wallMs)} p95=${ms(r.p95)} [${fmtStatuses(r.statuses)}]`);
    concResults.push(r);
  }

  // 3. Heavier read: text-export of the full briefing via the API (10 calls,
  //    well inside the 240 req/min/user API rate limit).
  console.error("[3/4] /api/export/briefing x10...");
  const exportResult = await benchSequential("/api/export/briefing", cookie, { warmups: 1, iterations: 10 });
  console.error(`  p50=${ms(exportResult.p50)} p95=${ms(exportResult.p95)} max=${ms(exportResult.max)} [${fmtStatuses(exportResult.statuses)}]`);

  // 4. Data-volume probe: grow the admin's data, then re-measure.
  console.error("[4/4] Data-volume probe: +200 ActivityEvent, +100 Note...");
  const now = Date.now();
  await prisma.activityEvent.createMany({
    data: Array.from({ length: 200 }, (_, i) => ({
      userId,
      type: "NOTE_CREATED",
      summary: `Perf probe activity event ${i + 1} — synthetic load row`,
      occurredAt: new Date(now - i * 60 * 1000),
    })),
  });
  await prisma.note.createMany({
    data: Array.from({ length: 100 }, (_, i) => ({
      title: `Perf probe note ${i + 1}`,
      content: `Synthetic perf note ${i + 1}: fire-safety walkthrough follow-up, vendor escalation, note for data-growth measurement.`,
      visibility: "PRIVATE",
      scope: "EXECUTIVE",
      authorId: userId,
    })),
  });
  const counts = {
    activityEvents: await prisma.activityEvent.count(),
    notes: await prisma.note.count(),
  };
  console.error(`  DB now has ${counts.activityEvents} ActivityEvent rows, ${counts.notes} Note rows`);

  const growthResults = [];
  for (const p of ["/briefing", "/search?q=note"]) {
    const r = await benchSequential(p, cookie);
    console.error(`  ${p}  p50=${ms(r.p50)} p95=${ms(r.p95)} max=${ms(r.max)} [${fmtStatuses(r.statuses)}]`);
    growthResults.push(r);
  }

  // ---------- budgets ----------
  const all200 = (rows) => rows.every((r) => Object.keys(r.statuses).every((c) => c === "200"));
  const no5xx = (rows) => rows.every((r) => Object.keys(r.statuses).every((c) => Number(c) < 500));
  const briefingGrowth = growthResults.find((r) => r.path === "/briefing");

  const budgets = [
    {
      name: `p95 <= ${BUDGETS.pageP95Ms} ms for every page at seed scale`,
      pass: pageResults.every((r) => r.p95 <= BUDGETS.pageP95Ms),
      detail: `worst page p95 = ${ms(Math.max(...pageResults.map((r) => r.p95)))} ms (${pageResults.reduce((a, b) => (a.p95 > b.p95 ? a : b)).path})`,
    },
    {
      name: "all requests return 200 (pages, concurrency, export, growth)",
      pass: all200(pageResults) && all200(concResults) && all200([exportResult]) && all200(growthResults),
      detail: `statuses seen: ${JSON.stringify([...pageResults, ...concResults, exportResult, ...growthResults].reduce((acc, r) => { for (const [c, n] of Object.entries(r.statuses)) acc[c] = (acc[c] ?? 0) + n; return acc; }, {}))}`,
    },
    {
      name: "no 5xx under 20-way concurrency",
      pass: no5xx(concResults),
      detail: concResults.map((r) => `${r.path}: ${fmtStatuses(r.statuses)}`).join("; "),
    },
    {
      name: `/briefing p95 <= ${BUDGETS.briefingGrowthP95Ms} ms after data growth (+200 events, +100 notes)`,
      pass: briefingGrowth.p95 <= BUDGETS.briefingGrowthP95Ms,
      detail: `/briefing p95 after growth = ${ms(briefingGrowth.p95)} ms`,
    },
  ];

  // ---------- report ----------
  const concTable = [
    "| Route | Concurrency | Wall time (ms) | p50 (ms) | p95 (ms) | max (ms) | Statuses |",
    "|---|---|---|---|---|---|---|",
    ...concResults.map(
      (r) => `| \`${r.path}\` | ${r.n} | ${ms(r.wallMs)} | ${ms(r.p50)} | ${ms(r.p95)} | ${ms(r.max)} | ${fmtStatuses(r.statuses)} |`
    ),
  ].join("\n");

  const budgetTable = [
    "| Budget | Result | Evidence |",
    "|---|---|---|",
    ...budgets.map((b) => `| ${b.name} | ${b.pass ? "PASS" : "FAIL"} | ${b.detail} |`),
  ].join("\n");

  const report = `# Performance & reliability evidence

Generated by \`scripts/perf.mjs\` on ${new Date().toISOString()}.

## Environment

- Single Linux container; app and load generator share the machine (loopback
  HTTP, no network latency — numbers reflect server processing + local I/O).
- Production build (\`next build\` output in \`.next\`), served by
  \`next start\` on port 3200 with Node ${process.version}, Next.js 16 App Router.
- SQLite via Prisma, scratch copy of the seeded dev database
  (\`prisma/perf.db\`) — the dev database itself is never touched.
- Requests authenticated as the seeded admin user via an HMAC-signed
  \`ceos_session\` cookie minted directly against the scratch DB.

## Methodology

1. **Page latency** — for each of ${PAGES.length} page routes: 3 warmup requests,
   then 30 sequential authenticated GETs; full response body read before
   stopping the timer. p50/p95/max computed over the 30 samples
   (nearest-rank percentile). Page routes are not rate-limited.
2. **Concurrency** — 20 simultaneous authenticated GETs to \`/briefing\`,
   then 20 to \`/dashboard\`; wall time and per-request percentiles recorded.
3. **Heavier read** — \`/api/export/briefing\` (full briefing rebuilt and
   serialized to text, plus an audit write per call): 1 warmup + 10 measured
   calls, staying far below the 240 req/min/user API rate limit.
4. **Data-volume probe** — 200 extra \`ActivityEvent\` rows and 100 extra
   \`Note\` rows inserted for the admin user via Prisma, then \`/briefing\`
   and \`/search?q=note\` re-measured (3 warmups + 30 iterations).

## Results

### 1. Page latency at seed scale (30 sequential requests per route)

${pageTable(pageResults)}

### 2. Concurrency (20 parallel requests)

${concTable}

### 3. Heavier read: \`/api/export/briefing\` (10 requests)

${pageTable([exportResult])}

### 4. After data growth (+200 ActivityEvent, +100 Note; totals: ${counts.activityEvents} events, ${counts.notes} notes)

${pageTable(growthResults)}

## Budget verdicts

${budgetTable}

${budgets.every((b) => b.pass) ? "All budgets pass." : "One or more budgets FAILED — see table above; numbers are reported as measured, not tuned."}

## Caveats

- Loopback measurements exclude real network latency and TLS.
- SQLite with a single writer; production (Postgres) will behave differently
  under concurrent writes.
- The load generator and server compete for the same CPU, which inflates
  tail latencies slightly under the 20-way concurrency test.
`;

  fs.writeFileSync(path.join(ROOT, "docs", "PERFORMANCE.md"), report);
  console.error(`\nWrote docs/PERFORMANCE.md`);

  // stdout: the markdown results
  console.log(report);

  const failed = budgets.filter((b) => !b.pass);
  await prisma.$disconnect();
  process.exit(failed.length === 0 ? 0 : 2);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});

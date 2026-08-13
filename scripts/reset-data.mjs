// DESTRUCTIVE: wipes ALL application data (every table) so a clean seed can
// run — used once to clear demo/sample data from a deployment. Requires the
// literal flag --yes-delete-everything. Schema is untouched.
//
// Usage (e.g. in the Render Shell):
//   node scripts/reset-data.mjs --yes-delete-everything && npm run db:seed
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

if (!process.argv.includes("--yes-delete-everything")) {
  console.error("Refusing to run: this deletes ALL data. Re-run with --yes-delete-everything if you are sure.");
  process.exit(1);
}

const db = new PrismaClient();

// Children before parents (FKs with cascade mostly, but explicit order is safer).
const order = [
  "chiefMessage", "chiefThread", "aiQueueItem", "briefingRecord", "providerEvent",
  "conversationBrief", "chatMessage", "conversationParticipant", "conversation",
  "emailDraft", "emailMessage", "emailBatch",
  "plaudRecording", "meeting", "memoryItem",
  "comment", "flag", "acknowledgement", "alert", "link", "storedFile",
  "actionItem", "project",
  "infraction", "directorFileEntry", "director",
  "contractSite", "contract", "vendorPerformanceRecord", "vendorSite", "vendor",
  "siteObservation", "siteVisit", "siteAssignment", "site",
  "notification", "activityEvent", "auditLog", "session", "setting", "user",
];

let total = 0;
for (const model of order) {
  const result = await db[model].deleteMany({});
  if (result.count > 0) console.log(`${model}: deleted ${result.count}`);
  total += result.count;
}
console.log(`Done — ${total} rows deleted. Now run: npm run db:seed`);
await db.$disconnect();

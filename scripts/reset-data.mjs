// DESTRUCTIVE: wipes ALL application data (every table) so a clean seed can
// run — used to clear demo/sample data from a deployment. Requires the
// literal flag --yes-delete-everything. Schema is untouched.
//
// Usage (e.g. in the Render Shell):
//   node scripts/reset-data.mjs --yes-delete-everything && npm run db:seed
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient, Prisma } = require("@prisma/client");

if (!process.argv.includes("--yes-delete-everything")) {
  console.error("Refusing to run: this deletes ALL data. Re-run with --yes-delete-everything if you are sure.");
  process.exit(1);
}

const db = new PrismaClient();

// Every model, straight from Prisma's metadata — nothing can be missed.
// Multi-pass handles foreign-key ordering.
const models = Prisma.dmmf.datamodel.models.map((m) => m.name[0].toLowerCase() + m.name.slice(1));
let total = 0;
let remaining = [...models];
for (let pass = 0; pass < models.length && remaining.length > 0; pass++) {
  const blocked = [];
  for (const model of remaining) {
    try {
      const result = await db[model].deleteMany({});
      if (result.count > 0) console.log(`${model}: deleted ${result.count}`);
      total += result.count;
    } catch {
      blocked.push(model);
    }
  }
  if (blocked.length === remaining.length) {
    console.error(`Could not clear tables: ${blocked.join(", ")}`);
    process.exit(1);
  }
  remaining = blocked;
}
console.log(`Done — ${total} rows deleted. Now run: npm run db:seed`);
await db.$disconnect();

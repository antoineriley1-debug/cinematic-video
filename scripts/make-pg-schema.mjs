// Generates prisma/schema.postgres.prisma from the canonical SQLite schema
// by swapping the datasource provider. Keeps the two in sync automatically —
// never edit the generated file by hand.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");
const pg = source.replace(
  /provider = "sqlite"/,
  'provider = "postgresql"',
).replace(
  "// Crothall Executive OS — authoritative relational data model.",
  "// GENERATED from schema.prisma by scripts/make-pg-schema.mjs — do not edit.\n// Crothall Executive OS — PostgreSQL production data model.",
);
fs.writeFileSync(path.join(root, "prisma", "schema.postgres.prisma"), pg);
console.log("prisma/schema.postgres.prisma generated");

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { beforeAll } from "vitest";

// Each test file gets a brand-new throwaway SQLite database. We delete the
// file and re-push the schema (no --force-reset needed; the file is ours).
process.env.DATABASE_URL = "file:./test.db";
process.env.SESSION_SECRET = "test-secret-0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.STORAGE_DIR = "./storage-test";

beforeAll(() => {
  const root = path.resolve(__dirname, "..");
  for (const f of ["test.db", "test.db-journal"]) {
    const p = path.join(root, "prisma", f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  execSync("npx prisma db push --skip-generate", {
    cwd: root,
    env: { ...process.env },
    stdio: "pipe",
  });
});

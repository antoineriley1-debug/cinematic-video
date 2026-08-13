import { defineConfig } from "@playwright/test";

// E2E runs against a production build (`next start`) on a dedicated port and
// database so the developer dev.db is never touched.
const E2E_ENV = {
  DATABASE_URL: "file:./e2e.db", // resolves relative to prisma/ -> prisma/e2e.db
  SESSION_SECRET: "e2e-secret-0123456789abcdef0123456789abcdef0123456789abcdef",
  STORAGE_DIR: "./storage-e2e",
};

export default defineConfig({
  testDir: "e2e",
  // The suite mutates a single shared seeded database; run serially.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    // Preinstalled browser (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1); the pinned
    // @playwright/test revision may differ from what is on disk.
    launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
    trace: "retain-on-failure",
  },
  projects: [
    // Log in once and reuse the session everywhere (login attempts are
    // rate-limited to 15/min/IP).
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      testIgnore: /auth\.setup\.ts/,
      use: { storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command:
      'bash -c "rm -f prisma/e2e.db && npx prisma db push --skip-generate && npm run db:seed:demo && npx next start -p 3100"',
    url: "http://localhost:3100/api/health",
    reuseExistingServer: false,
    timeout: 180_000,
    env: E2E_ENV,
  },
});

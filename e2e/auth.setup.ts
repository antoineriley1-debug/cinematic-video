import { test as setup, expect } from "@playwright/test";

const AUTH_FILE = "e2e/.auth/user.json";

// Single UI login for the whole suite. Every other spec reuses the saved
// storage state so we stay far below the 15 login/min/IP limiter.
setup("authenticate as Antoine", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("antoine@crothall-demo.local");
  await page.getByLabel("Password").fill("crothall-demo-2026");
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL("**/briefing");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Good (morning|afternoon|evening), Antoine\./);

  await page.context().storageState({ path: AUTH_FILE });
});

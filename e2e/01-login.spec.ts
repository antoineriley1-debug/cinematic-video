import { test, expect } from "@playwright/test";

// This spec exercises the login flow itself, so it must not reuse the saved
// authenticated storage state.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Login", () => {
  test("rejects a bad password with a visible error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("antoine@crothall-demo.local");
    await page.getByLabel("Password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Invalid email or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("accepts the seeded credentials and lands on the briefing", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("antoine@crothall-demo.local");
    await page.getByLabel("Password").fill("crothall-demo-2026");
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL("**/briefing");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Good (morning|afternoon|evening), Antoine\./);
    await expect(page.getByText("Here's your executive briefing for")).toBeVisible();
  });

  test("unauthenticated visitors are redirected to /login", async ({ page }) => {
    await page.goto("/briefing");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });
});

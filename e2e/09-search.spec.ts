import { test, expect } from "@playwright/test";

test.describe("Enterprise Search", () => {
  test('finds seeded records for "fire alarm"', async ({ page }) => {
    await page.goto("/search");
    await expect(page.getByRole("heading", { name: "Enterprise Search" })).toBeVisible();

    // The page-level search form (the global header has its own q input).
    await page.getByPlaceholder(/Search sites, directors, vendors/).fill("fire alarm");
    await page.getByRole("button", { name: "Search", exact: true }).click();

    await page.waitForURL(/\/search\?q=/);
    const results = page.locator("section", { has: page.getByRole("heading", { name: /results for "fire alarm"/ }) });
    await expect(results).toBeVisible();
    await expect(results).not.toContainText("Nothing found.");
    const rows = results.locator("li");
    expect(await rows.count()).toBeGreaterThan(0);
    // Seed contains the Guardian fire alarm vendor/contract.
    await expect(results.getByText(/Fire Alarm/i).first()).toBeVisible();
  });
});

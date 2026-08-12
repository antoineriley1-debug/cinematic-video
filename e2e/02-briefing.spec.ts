import { test, expect } from "@playwright/test";

test.describe("Daily Briefing", () => {
  test("contract renewal watch shows countdown items with DAYS remaining", async ({ page }) => {
    await page.goto("/briefing");

    const watchCard = page.locator("section", { has: page.getByRole("heading", { name: "Contract Renewal Watch" }) });
    await expect(watchCard).toBeVisible();

    const rows = watchCard.locator("li");
    expect(await rows.count()).toBeGreaterThan(0);
    // Every watch row carries a live "<n> DAYS" countdown.
    await expect(rows.first()).toContainText(/\d+ DAYS/);
    // Seeded contracts are inside the 90-day window.
    await expect(watchCard).toContainText("Regulated Medical Waste Services");
  });

  test("acknowledging a contract watch item removes it from the briefing after reload", async ({ page }) => {
    await page.goto("/briefing");

    const watchCard = page.locator("section", { has: page.getByRole("heading", { name: "Contract Renewal Watch" }) });
    await expect(watchCard).toBeVisible();
    const rows = watchCard.locator("li");
    const before = await rows.count();
    expect(before).toBeGreaterThan(1); // seed provides several watch entries

    await rows.first().getByRole("button", { name: "Acknowledge" }).click();
    // Server action revalidates the page in place.
    await expect(rows).toHaveCount(before - 1);

    // ...and the acknowledgement persists across a full reload.
    await page.reload();
    await expect(watchCard.locator("li")).toHaveCount(before - 1);
  });
});

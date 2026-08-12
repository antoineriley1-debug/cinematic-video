import { test, expect } from "@playwright/test";

test.describe("AI Chief of Staff", () => {
  test("answers a contract expiration question with sources (deterministic mode)", async ({ page }) => {
    await page.goto("/chief");
    await expect(page.getByRole("heading", { name: "AI Chief of Staff" })).toBeVisible();

    await page.getByPlaceholder("Ask your Chief of Staff…").fill("Which contracts are approaching expiration?");
    await page.getByRole("button", { name: "Ask", exact: true }).click();

    await page.waitForURL(/\/chief\?thread=/);

    // The question and the deterministic (no AI keys) grounded answer render.
    await expect(page.getByText("Which contracts are approaching expiration?").first()).toBeVisible();
    await expect(page.getByText(/Emergency Intelligence Mode — AI reasoning is temporarily unavailable/)).toBeVisible();
    // It lists matching records, including the live contract renewal watch.
    await expect(page.getByText(/These authorized records match your question:/)).toBeVisible();
    await expect(page.getByText(/Contract renewal watch/).first()).toBeVisible();

    // At least one numbered source citation link renders.
    const sourceLinks = page.locator('a[href^="/"]', { hasText: /^\[\d+\]/ });
    expect(await sourceLinks.count()).toBeGreaterThan(0);
  });
});

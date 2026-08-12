import { test, expect } from "@playwright/test";

const SITE = "Mercy General Hospital";

test.describe("Sites", () => {
  test("adds an observation to Critical Matters on a site page", async ({ page }) => {
    await page.goto("/sites");
    await page.getByRole("link", { name: new RegExp(SITE) }).click();
    await expect(page.getByRole("heading", { name: SITE })).toBeVisible();

    const critical = page.locator("section", { has: page.getByRole("heading", { name: "Critical Matters" }) });
    const note = `E2E critical matter — fire door latch failure ${Date.now()}`;
    await critical.getByPlaceholder(/Add to critical matters/i).fill(note);
    await critical.getByRole("button", { name: "Add" }).click();

    await expect(critical.getByText(note)).toBeVisible();

    // Persisted, not just optimistic UI.
    await page.reload();
    await expect(
      page
        .locator("section", { has: page.getByRole("heading", { name: "Critical Matters" }) })
        .getByText(note),
    ).toBeVisible();
  });

  test("site visit flow: start, observe, complete, visible on site page", async ({ page }) => {
    await page.goto("/sites");
    await page.getByRole("link", { name: new RegExp(SITE) }).click();
    await expect(page.getByRole("heading", { name: SITE })).toBeVisible();

    const visitsCard = page.locator("section", { has: page.getByRole("heading", { name: "Site Visits" }) });
    const visitsBefore = await visitsCard.locator("li").count();

    await page.getByRole("button", { name: "Start Site Visit" }).click();
    await page.waitForURL("**/visits/**");
    await expect(page.getByRole("heading", { name: `Site Visit — ${SITE}` })).toBeVisible();
    await expect(page.getByText("In progress")).toBeVisible();

    const observation = `E2E visit observation — stairwell B lighting out ${Date.now()}`;
    const improvement = page.locator("section", {
      has: page.getByRole("heading", { name: /IMPROVEMENT — Items needing improvement/ }),
    });
    await improvement.getByPlaceholder("Record an observation…").fill(observation);
    await improvement.getByRole("button", { name: "Add" }).click();
    await expect(improvement.getByText(observation)).toBeVisible();

    await page.getByPlaceholder("Visit summary (optional)").fill("E2E automated walk-through summary.");
    await page.getByRole("button", { name: /Complete visit/ }).click();

    // Completion redirects back to the site page, where the visit is listed.
    await page.waitForURL("**/sites/**");
    await expect(page.getByRole("heading", { name: SITE })).toBeVisible();
    const visitsAfter = page.locator("section", { has: page.getByRole("heading", { name: "Site Visits" }) });
    await expect(visitsAfter.locator("li")).toHaveCount(visitsBefore + 1);
    await expect(visitsAfter.getByText("COMPLETED").first()).toBeVisible();

    // The visit observation also lands in the site's improvement category.
    await expect(
      page
        .locator("section", { has: page.getByRole("heading", { name: "Improvement Opportunities" }) })
        .getByText(observation),
    ).toBeVisible();
  });
});

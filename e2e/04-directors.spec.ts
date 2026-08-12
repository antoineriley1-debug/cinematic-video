import { test, expect } from "@playwright/test";

test.describe("Directors", () => {
  test("records a SAFETY/HIGH infraction and shows it on the timeline", async ({ page }) => {
    await page.goto("/directors");
    await page.getByRole("link", { name: /Jane Delgado/ }).first().click();
    await expect(page.getByRole("heading", { name: "Jane Delgado" })).toBeVisible();

    const description = `E2E infraction — missed weekly safety huddle ${Date.now()}`;
    const card = page.locator("section", { has: page.getByRole("heading", { name: "Record Infraction" }) });
    await card.getByPlaceholder("Category (e.g. SAFETY)").fill("SAFETY");
    await card.locator('select[name="severity"]').selectOption("HIGH");
    await card.getByPlaceholder("Documented issue…").fill(description);
    await card.getByPlaceholder("Expected correction").fill("Attend and document all weekly safety huddles.");
    await card.getByRole("button", { name: "Record infraction" }).click();

    const timeline = page.locator("section", {
      has: page.getByRole("heading", { name: /Director Timeline/ }),
    });
    await expect(timeline.getByText(description)).toBeVisible();
    const row = timeline.locator("li", { hasText: description });
    await expect(row.getByText("INFRACTION", { exact: true })).toBeVisible();
    await expect(row.getByText("HIGH", { exact: true })).toBeVisible();

    // Persisted after reload.
    await page.reload();
    await expect(
      page
        .locator("section", { has: page.getByRole("heading", { name: /Director Timeline/ }) })
        .getByText(description),
    ).toBeVisible();
  });
});

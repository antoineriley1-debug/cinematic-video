import { test, expect } from "@playwright/test";

const MINUTES = `Weekly operations sync — attendees: Antoine Riley, Heather Collins, Jane Delgado.

We decided to move the OR terminal cleaning overhaul kickoff to next month.
The team agreed the vendor scorecard format is approved for regional rollout.

Please schedule the Joint Commission mock survey with Mercy General Hospital leadership.
Heather must submit the updated staffing matrix by Friday.

Open question: whether Lakeview Behavioral Health needs a dedicated project manager.`;

test.describe("Meeting Minutes", () => {
  test("uploads pasted minutes and shows extracted decisions and actions", async ({ page }) => {
    await page.goto("/meetings");
    await expect(page.getByRole("heading", { name: "Meeting Minutes" })).toBeVisible();

    const title = `E2E weekly ops sync ${Date.now()}`;
    await page.getByPlaceholder("Meeting title").fill(title);
    await page.locator('textarea[name="minutesText"]').fill(MINUTES);
    await page.getByRole("button", { name: "Upload & analyze" }).click();

    await page.waitForURL(/\/meetings\/[^/]+$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    // Deterministic analysis summary.
    await expect(page.getByText(/\[Deterministic\]/)).toBeVisible();

    // Decisions extracted from "We decided..." / "agreed ... approved" lines.
    const decisions = page.locator("section", { has: page.getByRole("heading", { name: /^Decisions \(\d+\)/ }) });
    await expect(decisions).toContainText("We decided to move the OR terminal cleaning overhaul kickoff to next month.");

    // Action items extracted from "Please schedule..." / "must submit..." lines.
    const actions = page.locator("section", { has: page.getByRole("heading", { name: /Extracted actions/ }) });
    await expect(actions).toContainText("Please schedule the Joint Commission mock survey");
    await expect(actions).toContainText("Heather must submit the updated staffing matrix by Friday.");

    // Original minutes preserved verbatim.
    await expect(page.getByText("Open question: whether Lakeview Behavioral Health needs a dedicated project manager.").first()).toBeVisible();
  });
});

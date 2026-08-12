import { test, expect } from "@playwright/test";

const PASTED_EMAIL = `From: Sandra Ellis <sandra.ellis@mercygeneral.example.org>
Subject: Urgent: failed fire alarm inspection at Mercy General Hospital

Team,

This is urgent. The quarterly inspection at Mercy General Hospital identified a
failed fire alarm panel in the east wing that must be corrected.

Please schedule the corrective re-inspection no later than September 15, 2026.
We need to confirm the vendor response window today.

Sandra Ellis
Chief Facilities Officer`;

test.describe("Email Intelligence (deterministic Emergency mode)", () => {
  test("full flow: paste, analyze, confirm relationship, draft CORRECTIVE reply", async ({ page }) => {
    await page.goto("/emails");
    await expect(page.getByRole("heading", { name: "Email Intelligence" })).toBeVisible();

    await page.locator('textarea[name="pasted"]').fill(PASTED_EMAIL);
    await page.getByRole("button", { name: "Analyze" }).click();

    // Ingestion redirects to the email detail page.
    await page.waitForURL(/\/emails\/[^/]+$/);
    await expect(
      page.getByRole("heading", { name: /Urgent: failed fire alarm inspection at Mercy General Hospital/ }),
    ).toBeVisible();

    // Deterministic analysis: labeled summary, urgency badge, emergency mode label.
    await expect(page.getByText(/\[Deterministic\]/).first()).toBeVisible();
    await expect(page.getByText("URGENT", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Emergency Intelligence Mode").first()).toBeVisible();
    // The date in the body is extracted.
    await expect(page.getByText("September 15, 2026").first()).toBeVisible();

    // Suggested relationship to the mentioned site awaits human confirmation.
    const suggestions = page.locator("section", {
      has: page.getByRole("heading", { name: "Confirm suggested relationships" }),
    });
    await expect(suggestions).toBeVisible();
    const siteRow = suggestions.locator("li", { hasText: "Mercy General Hospital" });
    await expect(siteRow).toBeVisible();
    await siteRow.getByRole("button", { name: "Confirm" }).click();

    // Confirmed connections now list the site.
    const analysisCard = page.locator("section", { has: page.getByText("Confirmed connections") });
    await expect(analysisCard.getByRole("link", { name: /site: Mercy General Hospital/ })).toBeVisible();

    // Draft a CORRECTIVE reply via the personality engine.
    const draftCard = page.locator("section", {
      has: page.getByRole("heading", { name: "Draft a response — personality engine" }),
    });
    await draftCard.locator('select[name="personality"]').selectOption("CORRECTIVE");
    await draftCard.getByRole("button", { name: "Draft reply" }).click();

    await expect(draftCard.getByText("requiring correction")).toBeVisible();
    await expect(draftCard.getByText("Emergency Intelligence Mode")).toBeVisible();
  });
});

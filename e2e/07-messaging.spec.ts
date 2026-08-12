import { test, expect } from "@playwright/test";

test.describe("Executive Messaging", () => {
  test("starts a conversation with Heather and sends a message", async ({ page }) => {
    await page.goto("/messages");
    await expect(page.getByRole("heading", { name: "Executive Messaging" })).toBeVisible();

    const memberSelect = page.locator('select[name="memberIds"]');
    const heatherValue = await memberSelect.locator("option", { hasText: "Heather Collins" }).getAttribute("value");
    expect(heatherValue).toBeTruthy();
    await memberSelect.selectOption(heatherValue!);
    await page.getByRole("button", { name: "Start", exact: true }).click();

    await page.waitForURL(/\/messages\/[^/]+$/);
    await expect(page.getByText(/Participants:.*Heather Collins/)).toBeVisible();

    const message = `Please review the Mercy contract @Heather (e2e ${Date.now()})`;
    await page.getByPlaceholder("Message — @Name to mention").fill(message);
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText(message)).toBeVisible();

    // The message persists in the thread after reload and shows the sender.
    await page.reload();
    await expect(page.getByText(message)).toBeVisible();
    await expect(page.getByText(/Antoine Riley ·/).last()).toBeVisible();
  });
});

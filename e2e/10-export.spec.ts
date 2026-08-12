import { test, expect } from "@playwright/test";

test.describe("Exports", () => {
  test("briefing export returns the plain-text daily executive briefing", async ({ page }) => {
    // page.request shares the authenticated session cookies.
    const response = await page.request.get("/api/export/briefing");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/plain");
    expect(response.headers()["content-disposition"]).toContain("attachment");

    const text = await response.text();
    expect(text).toContain("DAILY EXECUTIVE BRIEFING");
  });

  test("briefing export rejects unauthenticated requests", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const response = await context.request.get("http://localhost:3100/api/export/briefing");
    expect(response.status()).toBe(401);
    await context.close();
  });
});

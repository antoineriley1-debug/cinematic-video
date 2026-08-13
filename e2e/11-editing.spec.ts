import { test, expect } from "@playwright/test";

// Editing and deleting the records an executive owns: projects, actions,
// and deadlines. Every assertion survives a reload — persisted, not
// optimistic UI.
test.describe("Editing projects, actions, and deadlines", () => {
  test("creates, edits, and deletes a project", async ({ page }) => {
    const original = `E2E project ${Date.now()}`;
    const renamed = `${original} — renamed`;

    await page.goto("/projects");
    const create = page.locator("section", { has: page.getByRole("heading", { name: "New project" }) });
    await create.getByPlaceholder("Project name").fill(original);
    await create.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByText(original, { exact: true })).toBeVisible();

    // Edit: rename, change status and priority.
    const card = page.locator("section", { hasText: original }).first();
    await card.getByText("Edit project").click();
    const form = card.locator("form", { has: page.locator('input[name="name"]') });
    await form.locator('input[name="name"]').fill(renamed);
    await form.locator('select[name="status"]').selectOption("ON_HOLD");
    await form.locator('select[name="priority"]').selectOption("HIGH");
    await form.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText(renamed, { exact: true })).toBeVisible();
    await page.reload();
    const edited = page.locator("section", { hasText: renamed }).first();
    await expect(edited).toContainText("ON HOLD");
    await expect(edited).toContainText("HIGH");

    // Delete (auto-accept the confirmation dialog).
    page.on("dialog", (d) => d.accept());
    await edited.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(renamed, { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(renamed, { exact: true })).toHaveCount(0);
  });

  test("edits an action into a deadline with a due date, then completes and reopens it", async ({ page }) => {
    const original = `E2E action ${Date.now()}`;
    const renamed = `${original} — revised`;

    await page.goto("/actions");
    const create = page.locator("section", { has: page.getByRole("heading", { name: "New action or deadline" }) });
    await create.getByPlaceholder("Title").fill(original);
    await create.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText(original, { exact: true })).toBeVisible();

    // Edit: rename, convert ACTION → DEADLINE, set a due date.
    await page.getByText(`Edit: ${original}`).click();
    const form = page.locator("form", { has: page.locator(`input[name="title"][value="${original}"]`) });
    await form.locator('input[name="title"]').fill(renamed);
    await form.locator('select[name="kind"]').selectOption("DEADLINE");
    await form.locator('input[name="dueDate"]').fill("2026-12-31");
    await form.getByRole("button", { name: "Save changes" }).click();

    await page.reload();
    const row = page.locator("li", { hasText: renamed }).first();
    await expect(row).toContainText("DEADLINE");

    // Complete it, then reopen it from the completed list.
    await row.getByRole("button", { name: "Complete" }).click();
    await page.reload();
    const completed = page.locator("li", { hasText: renamed }).first();
    await expect(completed.getByRole("button", { name: "Reopen" })).toBeVisible();
    await completed.getByRole("button", { name: "Reopen" }).click();

    await page.reload();
    await expect(page.locator("li", { hasText: renamed }).first()).toContainText("DEADLINE");

    // Clean up: delete it.
    page.on("dialog", (d) => d.accept());
    await page.getByText(`Edit: ${renamed}`).click();
    const editForm = page.locator("form", { has: page.locator(`input[name="title"][value="${renamed}"]`) });
    await editForm.getByRole("button", { name: "Delete" }).click();
    await page.reload();
    await expect(page.getByText(renamed, { exact: true })).toHaveCount(0);
  });
});

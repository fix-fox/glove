import { test, expect } from "@playwright/test";

test.describe("keyboard layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for the grid to render
    await page.locator(".grid").first().waitFor();
  });

  test("default empty layout", async ({ page }) => {
    await expect(page.locator(".grid").first()).toHaveScreenshot("default-layout.png");
  });

  test("key editor open", async ({ page }) => {
    // Click a non-magic key to open the editor — use dispatchEvent
    // to avoid click coordinates landing on the wrapper div
    const firstKey = page.locator(".grid button").first();
    await firstKey.dispatchEvent("click");
    await page.getByTestId("key-editor-overlay").waitFor({ timeout: 5000 });
    await expect(page).toHaveScreenshot("key-editor-open.png");
  });

  test("toolbar", async ({ page }) => {
    // Toolbar is the first flex row
    const toolbar = page.locator(".flex.flex-wrap.items-center").first();
    await expect(toolbar).toHaveScreenshot("toolbar.png");
  });
});

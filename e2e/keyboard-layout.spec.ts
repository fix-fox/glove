import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Block save/flash API routes to prevent side effects
  await page.route("**/api/save", (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) }),
  );
  await page.route("**/api/flash", (route) =>
    route.fulfill({ status: 200, body: "mocked" }),
  );

  await page.goto("/");
  await page.getByTestId("layer-tabs").waitFor();
});

test("default layout grid", async ({ page }) => {
  await expect(page.locator(".grid").first()).toHaveScreenshot("default-layout.png");
});

test("toolbar", async ({ page }) => {
  await expect(page.getByTestId("toolbar")).toHaveScreenshot("toolbar.png");
});

test("base layer shows magic positions", async ({ page }) => {
  const grid = page.locator(".grid").first();
  await expect(grid.locator("text=Magic").first()).toBeVisible();
  await expect(page).toHaveScreenshot("base-layer-magic.png");
});


test("key editor open", async ({ page }) => {
  const firstKey = page.locator(".grid button").first();
  await firstKey.dispatchEvent("click");
  await page.getByTestId("key-editor-overlay").waitFor({ timeout: 5000 });
  await expect(page).toHaveScreenshot("key-editor-open.png");
});

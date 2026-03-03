import { test, expect } from "@playwright/test";
import { fixtureConfig } from "./fixture-config";

test.beforeEach(async ({ page }) => {
  // Serve fixture config instead of reading from disk
  const body = JSON.stringify(fixtureConfig);
  await page.route("**/api/config", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body }),
  );
  // Block save/flash API routes to prevent side effects
  await page.route("**/api/save", (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) }),
  );
  await page.route("**/api/flash", (route) =>
    route.fulfill({ status: 200, body: "mocked" }),
  );

  await page.goto("/");
  // Wait for fixture config to load (the "Symbols" tab proves it)
  await page.getByTestId("layer-tabs").getByText("Symbols").waitFor();
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

test("settings modal — HRM", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("dialog").getByText("HRM", { exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveScreenshot("settings-hrm.png");
});

test("key editor open", async ({ page }) => {
  const qKey = page.locator(".grid button", { hasText: "Q" }).first();
  await qKey.click();
  await page.getByTestId("key-editor-overlay").waitFor({ timeout: 5000 });
  await expect(page).toHaveScreenshot("key-editor-open.png");
});

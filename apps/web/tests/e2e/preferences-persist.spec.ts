/**
 * Preferences persist E2E: set default view, group, sort, selected-only;
 * reload with clean URL; assert state restored (server-backed).
 */

import { test, expect } from "./fixtures/seed";
import { gotoProject, switchToAllDataView } from "./helpers/nav";
import { closeOverlays, ensureFactsControlsOpen } from "./helpers/ui";
import { waitForAppIdle } from "./helpers/setup";


test.describe("Preferences persist", () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test("set default view, group, sort, selected-only; reload; state restored", async ({
    page,
    seed,
  }) => {
    await switchToAllDataView(page);
    await closeOverlays(page);
    await ensureFactsControlsOpen(page);

    await page.getByTestId("facts-sort-trigger").click();
    await page.getByTestId("facts-sort-option-needs_review").click();
    await page.getByTestId("facts-group-trigger").click();
    await page.getByTestId("facts-group-option-source").click();
    await page.getByTestId("facts-selected-only-toggle").check();

    await page.getByTestId("views-trigger").click();
    await expect(page.getByTestId("views-panel")).toBeVisible({ timeout: 3000 });
    await page.getByTestId("views-create-input").fill("My Default");
    await page.getByTestId("views-create-save").click();
    await expect(async () => {
      await page.getByTestId("views-trigger").click();
      await expect(page.getByTestId("views-item").first()).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 15_000 });
    await page.getByTestId("views-set-default").first().click();
    await page.getByTestId("views-trigger").click();

    await waitForAppIdle(page);
    await page.waitForTimeout(300);

    await page.goto(`/project/${seed.project_id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("fact-card").first()).toBeVisible({ timeout: 15_000 });
    await ensureFactsControlsOpen(page);

    await expect(async () => {
      await expect(page.getByTestId("facts-sort-trigger")).toContainText(/needs review/i);
      await expect(page.getByTestId("facts-group-trigger")).toContainText(/source/i);
      await expect(page.getByTestId("facts-selected-only-toggle")).toBeChecked();
    }).toPass({ timeout: 10_000 });
  });
});

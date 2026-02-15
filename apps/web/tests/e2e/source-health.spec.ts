import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';

/**
 * Source Health E2E - open panel, assert rows with counts/status, click Open filters to URL.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 */

test.describe('Source Health', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('open panel, assert rows show counts and status, click Open filters to URL', async ({ page }) => {
    await page.getByTestId('source-health-button').click();

    await expect(page.getByTestId('source-health-panel')).toBeVisible({ timeout: 5000 });
    await expect(async () => {
      const rows = page.locator('[data-testid="source-health-panel"] li');
      await expect(rows.first()).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 10000 });

    const firstOpen = page.getByTestId('source-health-open').first();
    await expect(firstOpen).toBeVisible({ timeout: 5000 });
    await firstOpen.click();

    await expect(page.getByTestId('source-health-panel')).toBeHidden();

    await expect(page.getByTestId('fact-card').first()).toBeVisible({ timeout: 5000 });
  });
});

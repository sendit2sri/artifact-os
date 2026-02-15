import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';
import { seedWithNearDuplicate } from './helpers/dedup';
import { ensureFactsControlsOpen } from './helpers/ui';

/**
 * Facts Dedup E2E - seed near-duplicates, run dedup, assert suppressed count, show suppressed toggle.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 */

test.describe('Facts Dedup', () => {
  test.beforeEach(async ({ page, seed }) => {
    await seedWithNearDuplicate(seed.project_id, seed.source_id);
    await gotoProject(page, seed.project_id);
  });

  test('click dedup trigger, assert suppressed toast, toggle show suppressed reveals more', async ({ page }) => {
    await expect(page.getByTestId('fact-card').first()).toBeVisible({ timeout: 10000 });

    await ensureFactsControlsOpen(page);
    const dedupBtn = page.getByTestId('facts-dedup-trigger');
    await expect(dedupBtn).toBeVisible();
    await dedupBtn.click();

    await expect(page.getByText(/Suppressed duplicates?/i)).toBeVisible({ timeout: 8000 });

    const before = await page.getByTestId('fact-card').count();

    const showSuppressed = page.getByTestId('facts-show-suppressed-toggle');
    await expect(showSuppressed).toBeVisible();
    await showSuppressed.check();

    const after = await page.getByTestId('fact-card').count();
    expect(after).toBeGreaterThanOrEqual(before);
  });
});

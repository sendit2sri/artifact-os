import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';

/**
 * Pin Facts E2E - pin first fact, assert pinned state, Pinned filter, persist after reload.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 */

test.describe('Pin Facts', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('pin first fact → pinned state visible, Pinned filter shows it, persists after reload', async ({ page }) => {
    const firstCard = page.getByTestId('fact-card').first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });

    const pinStateBefore = page.getByTestId('fact-pin-state').first();
    await expect(pinStateBefore).toHaveAttribute('data-pinned', 'false');

    const pinToggle = page.getByTestId('fact-pin-toggle').first();
    await pinToggle.click();

    await expect(async () => {
      const pinStateAfter = page.getByTestId('fact-pin-state').first();
      await expect(pinStateAfter).toHaveAttribute('data-pinned', 'true');
    }).toPass({ timeout: 5000 });

    await page.getByTestId('facts-filter-pinned').click();

    await expect(async () => {
      const pinnedCards = page.getByTestId('fact-card');
      await expect(pinnedCards.first()).toBeVisible();
      const pinState = page.getByTestId('fact-pin-state').first();
      await expect(pinState).toHaveAttribute('data-pinned', 'true');
    }).toPass({ timeout: 5000 });

    await page.reload();

    await expect(page.getByTestId('fact-card').first()).toBeVisible({ timeout: 10000 });
    await page.getByTestId('facts-filter-pinned').click();

    await expect(async () => {
      const pinState = page.getByTestId('fact-pin-state').first();
      await expect(pinState).toHaveAttribute('data-pinned', 'true');
    }).toPass({ timeout: 5000 });
  });
});

import { test, expect } from './fixtures/seed';
import { gotoProject, switchToAllDataView } from './helpers/nav';
import { seedWithSimilarFacts } from './helpers/collapse-similar';

/**
 * Similar Drawer Selection E2E - select rep fact, open similar drawer,
 * click "Select all in group", assert selected count increases by group size.
 */

test.describe('Similar Drawer Selection', () => {
  test.beforeEach(async ({ page, seed }) => {
    await seedWithSimilarFacts(seed.project_id, seed.source_id);
    await gotoProject(page, seed.project_id);
  });

  test('select rep fact, open similar drawer, select all in group, assert count increases', async ({
    page,
  }) => {
    await switchToAllDataView(page);
    await expect(page.getByTestId('fact-card').first()).toBeVisible({ timeout: 10000 });

    const toggle = page.getByTestId('toggle-collapse-similar');
    await expect(toggle).toBeVisible();
    await toggle.check();

    await expect(page.getByTestId('fact-similar-chip').first()).toBeVisible({ timeout: 5000 });

    const firstCard = page.getByTestId('fact-card').first();
    await firstCard.getByTestId('fact-select-button').click();

    const selectionBar = page.getByTestId('selection-bar');
    await expect(selectionBar).toBeVisible();
    const selectedBefore = await selectionBar.locator('strong').first().textContent();
    const countBefore = parseInt(selectedBefore ?? '0', 10);

    const chip = page.getByTestId('fact-similar-chip').first();
    await chip.click();

    const drawer = page.getByTestId('similar-facts-drawer');
    await expect(drawer).toBeVisible({ timeout: 5000 });

    const selectAllBtn = page.getByTestId('similar-facts-select-all');
    await expect(selectAllBtn).toBeVisible();
    await selectAllBtn.click();

    await expect(async () => {
      const selectedAfter = await selectionBar.locator('strong').first().textContent();
      const countAfter = parseInt(selectedAfter ?? '0', 10);
      expect(countAfter).toBeGreaterThan(countBefore);
    }).toPass({ timeout: 5000 });
  });
});

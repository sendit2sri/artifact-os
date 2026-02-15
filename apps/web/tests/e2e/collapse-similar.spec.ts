import { test, expect } from './fixtures/seed';
import { gotoProject, switchToAllDataView } from './helpers/nav';
import { seedWithSimilarFacts } from './helpers/collapse-similar';
import { ensureFactsControlsOpen } from './helpers/ui';

/**
 * Collapse Similar E2E - seed with token-similar facts, toggle collapse on,
 * assert fewer fact cards, rep has fact-similar-chip, click chip opens similar drawer.
 */

test.describe('Collapse Similar', () => {
  test.beforeEach(async ({ page, seed }) => {
    await seedWithSimilarFacts(seed.project_id, seed.source_id);
    await gotoProject(page, seed.project_id);
  });

  test('toggle collapse on, assert fewer fact cards, rep has fact-similar-chip, click chip opens drawer', async ({
    page,
  }) => {
    await switchToAllDataView(page);
    await expect(page.getByTestId('fact-card').first()).toBeVisible({ timeout: 10000 });

    const countBefore = await page.getByTestId('fact-card').count();
    expect(countBefore).toBeGreaterThanOrEqual(4);

    await ensureFactsControlsOpen(page);
    const toggle = page.getByTestId('toggle-collapse-similar');
    await expect(toggle).toBeVisible();
    await toggle.check();

    await expect(async () => {
      const countAfter = await page.getByTestId('fact-card').count();
      expect(countAfter).toBeLessThan(countBefore);
    }).toPass({ timeout: 5000 });

    const chip = page.getByTestId('fact-similar-chip').first();
    await expect(chip).toBeVisible({ timeout: 5000 });

    await chip.click();

    const drawer = page.getByTestId('similar-facts-drawer');
    await expect(drawer).toBeVisible({ timeout: 5000 });
  });
});

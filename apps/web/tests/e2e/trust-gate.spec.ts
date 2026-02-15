/**
 * Trust Gate E2E - select facts with NEEDS_REVIEW, click Generate, trust gate appears,
 * Remove non-approved, generate, assert quality stats.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 */

import { test, expect } from './fixtures/seed';
import { gotoProject, switchToAllDataView } from './helpers/nav';
import { ensureOutputDrawerAfterGenerate } from './helpers/synthesis';

test.describe('Trust Gate', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('select mixed-status facts, Generate opens drawer with trust gate, Remove non-approved, generate, assert quality stats', async ({ page }) => {
    await switchToAllDataView(page);
    const factCards = page.getByTestId('fact-card');
    await expect(factCards.first()).toBeVisible({ timeout: 10000 });

    const first = factCards.nth(0);
    const second = factCards.nth(1);
    const third = factCards.nth(2);
    await first.getByTestId('fact-select-button').click();
    await second.getByTestId('fact-select-button').click();
    await third.getByTestId('fact-select-button').click();

    await page.getByTestId('generate-synthesis').click();
    await ensureOutputDrawerAfterGenerate(page, 'merge');

    await expect(page.getByTestId('output-drawer')).toBeVisible();
    await expect(page.getByTestId('output-quality-stats')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('output-quality-approved')).toContainText(/[1-9]/);
    await expect(page.getByTestId('output-quality-needs_review')).toContainText('0');
  });
});

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
    const card1 = page.getByTestId('fact-card').filter({ hasText: '[E2E:APPROVED-1]' });
    const card2 = page.getByTestId('fact-card').filter({ hasText: '[E2E:APPROVED-2]' });
    const card3 = page.getByTestId('fact-card').filter({ hasText: '[E2E:NEEDS_REVIEW-1]' });
    await expect(card1).toBeVisible({ timeout: 10000 });

    await card1.getByTestId('fact-select-button').click();
    await card2.getByTestId('fact-select-button').click();
    await card3.getByTestId('fact-select-button').click();

    await page.getByTestId('generate-synthesis').click();
    await ensureOutputDrawerAfterGenerate(page, 'merge');

    await expect(page.getByTestId('output-drawer')).toBeVisible();
    await expect(page.getByTestId('output-quality-stats')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('output-quality-approved')).toContainText(/[1-9]/);
    await expect(page.getByTestId('output-quality-needs_review')).toContainText('0');
  });
});

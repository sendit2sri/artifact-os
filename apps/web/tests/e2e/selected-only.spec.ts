/**
 * Selected only E2E: select 3 facts, enable "Selected only", assert only those visible; disable, full list returns.
 */

import { test, expect } from './fixtures/seed';
import { gotoProject, switchToAllDataView } from './helpers/nav';
import { ensureFactsControlsOpen } from './helpers/ui';

test.describe('Selected only', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('select 3 facts, enable Selected only: only those 3 visible; disable restores full list', async ({
    page,
  }) => {
    await switchToAllDataView(page);
    await ensureFactsControlsOpen(page);
    const card1 = page.getByTestId('fact-card').filter({ hasText: '[E2E:APPROVED-1]' });
    const card2 = page.getByTestId('fact-card').filter({ hasText: '[E2E:APPROVED-2]' });
    const card3 = page.getByTestId('fact-card').filter({ hasText: '[E2E:APPROVED-3]' });
    await expect(card1).toBeVisible({ timeout: 5000 });
    const countBefore = await page.getByTestId('fact-card').count();
    expect(countBefore).toBeGreaterThanOrEqual(3);

    await card1.getByTestId('fact-select-button').click();
    await card2.getByTestId('fact-select-button').click();
    await card3.getByTestId('fact-select-button').click();

    await page.getByTestId('facts-selected-only-toggle').check();
    await expect(async () => {
      const visibleCards = page.getByTestId('fact-card');
      await expect(visibleCards).toHaveCount(3);
    }).toPass({ timeout: 10_000 });

    await page.getByTestId('facts-selected-only-toggle').uncheck();
    await expect(async () => {
      const visibleCards = page.getByTestId('fact-card');
      await expect(visibleCards.count()).resolves.toBe(countBefore);
    }).toPass({ timeout: 10_000 });
  });
});

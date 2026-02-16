/**
 * Selection Autosave E2E - select facts, reload, assert restored selection banner.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 * Run: npx playwright test selection-autosave.spec.ts --workers=3
 */

import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';
import { waitForAppIdle } from './helpers/setup';

test.describe('Selection Autosave', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('select 3 facts → reload → restored selection banner and count persists', async ({ page, seed }) => {
    await page.getByTestId('view-tab-all').click();
    const card1 = page.getByTestId('fact-card').filter({ hasText: '[E2E:APPROVED-1]' });
    const card2 = page.getByTestId('fact-card').filter({ hasText: '[E2E:APPROVED-2]' });
    const card3 = page.getByTestId('fact-card').filter({ hasText: '[E2E:APPROVED-3]' });
    await expect(card1).toBeVisible({ timeout: 10_000 });

    await card1.getByTestId('fact-select-button').click();
    await card2.getByTestId('fact-select-button').click();
    await card3.getByTestId('fact-select-button').click();

    const toSelect = 3;
    await expect(page.getByTestId('selection-bar')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('bulk-actions-label')).toContainText(String(toSelect));

    await waitForAppIdle(page);
    await page.waitForFunction(
      (key) => {
        const v = localStorage.getItem(key);
        return v && v.includes('"');
      },
      `artifact_selected_facts_v1:${seed.project_id}`,
      { timeout: 5000 }
    );

    await page.reload();
    await expect(page.getByTestId('fact-card').first()).toBeVisible({ timeout: 10_000 });

    await expect(async () => {
      await expect(page.getByTestId('selection-restore-banner')).toBeVisible();
      await expect(page.getByTestId('selection-restore-banner')).toContainText(`Restored ${toSelect}`);
      await expect(page.getByTestId('bulk-actions-label')).toContainText(String(toSelect));
    }).toPass({ timeout: 5000 });
  });
});

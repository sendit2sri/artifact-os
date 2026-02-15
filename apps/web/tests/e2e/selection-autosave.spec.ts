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
    const cards = page.getByTestId('fact-card');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    const count = await cards.count();
    const toSelect = Math.min(3, count);
    for (let i = 0; i < toSelect; i++) {
      const card = cards.nth(i);
      const selBtn = card.getByTestId('fact-select-button');
      await selBtn.click();
    }

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

import { test, expect } from './fixtures/seed';
import {
  openOutputsHistory,
  assertHistoryHasItems,
  openFirstHistoryItem,
} from './helpers/outputs-history';
import { generateSynthesis, closeDrawer } from './helpers/synthesis';
import { gotoProject } from './helpers/nav';

/**
 * History Back Button E2E - open history, open first output, back to history list.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 */

test.describe('History Back Button', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('open history, open first output, verify back button, click back, history list visible', async ({ page, seed }) => {
    const result = await generateSynthesis(page, seed.project_id);
    expect(result).toBe('drawer');
    await closeDrawer(page);

    await openOutputsHistory(page);
    await assertHistoryHasItems(page);
    await openFirstHistoryItem(page);

    await expect(async () => {
      const outputDrawer = page.getByTestId('output-drawer');
      await expect(outputDrawer).toBeVisible();
      const backBtn = page.getByTestId('output-drawer-back-to-history');
      await expect(backBtn).toBeVisible();
    }).toPass({ timeout: 10000 });

    await page.getByTestId('output-drawer-back-to-history').click();

    await expect(async () => {
      const historyDrawer = page.getByTestId('outputs-history-drawer');
      await expect(historyDrawer).toBeVisible();
      const list = page.getByTestId('outputs-history-list');
      await expect(list).toBeVisible();
    }).toPass({ timeout: 5000 });
  });
});

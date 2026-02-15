import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';
import { generateSynthesis, closeDrawer } from './helpers/synthesis';
import {
  openOutputsHistory,
  assertHistoryHasItems,
} from './helpers/outputs-history';

/**
 * Pin Outputs E2E - generate output, pin from OutputDrawer, History shows pinned section.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 */

test.describe('Pin Outputs', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('generate output, pin from OutputDrawer, open History → pinned section shows output at top', async ({ page, seed }) => {
    const result = await generateSynthesis(page, seed.project_id);
    expect(result).toBe('drawer');

    const pinToggle = page.getByTestId('output-pin-toggle');
    await expect(pinToggle).toBeVisible({ timeout: 5000 });
    await pinToggle.click();

    await closeDrawer(page);

    await openOutputsHistory(page);
    await assertHistoryHasItems(page);

    const pinnedSection = page.getByTestId('outputs-history-pinned-section');
    await expect(pinnedSection).toBeVisible({ timeout: 5000 });
    const pinnedItem = page.getByTestId('outputs-history-item-pinned');
    await expect(pinnedItem.first()).toBeVisible();
  });
});

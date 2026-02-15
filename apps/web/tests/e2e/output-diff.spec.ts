/**
 * Output Diff E2E - Compare two outputs, assert diff shows added/removed lines.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 * Seed provides 2 outputs; we generate two different modes to ensure differing content.
 * Run: npx playwright test output-diff.spec.ts --workers=3
 */

import { test, expect } from './fixtures/seed';
import {
  closeDrawer,
  setSynthesisFormat,
  selectTwoFacts,
  clickGenerate,
  ensureOutputDrawerAfterGenerate,
} from './helpers/synthesis';
import {
  openOutputsHistory,
  assertHistoryHasItems,
} from './helpers/outputs-history';
import { gotoProject } from './helpers/nav';

test.describe('Output Diff', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('open History, Compare, select A and B, assert diff shows added or removed line', async ({
    page,
  }) => {
    await selectTwoFacts(page);
    await setSynthesisFormat(page, 'paragraph');
    await clickGenerate(page);
    await ensureOutputDrawerAfterGenerate(page, 'merge');
    await closeDrawer(page);

    await selectTwoFacts(page);
    await setSynthesisFormat(page, 'script_outline');
    await clickGenerate(page);
    await ensureOutputDrawerAfterGenerate(page, 'merge');
    await closeDrawer(page);

    await openOutputsHistory(page);
    await assertHistoryHasItems(page);

    const compareBtn = page.getByTestId('outputs-compare-open');
    await expect(compareBtn).toBeVisible({ timeout: 5000 });
    await compareBtn.click();

    await expect(page.getByTestId('outputs-compare-drawer')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('outputs-compare-select-a')).toBeVisible();
    await expect(page.getByTestId('outputs-compare-select-b')).toBeVisible();

    await page.getByTestId('outputs-compare-select-a').click();
    await page.getByRole('option').nth(0).click();
    await page.getByTestId('outputs-compare-select-b').click();
    await page.getByRole('option').nth(1).click();

    await expect(
      page.getByTestId('diff-line-added').or(page.getByTestId('diff-line-removed'))
    ).toBeVisible({ timeout: 15000 });
  });
});

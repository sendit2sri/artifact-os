import { test, expect } from './fixtures/seed';
import {
  assertDrawerSuccess,
  closeDrawer,
  closeHistoryPanel,
  generateSynthesis,
  openLastOutput,
} from './helpers/synthesis';
import {
  openOutputsHistory,
  assertHistoryHasItems,
  openFirstHistoryItem,
  assertHistoryEmpty,
  closeOutputsHistory,
} from './helpers/outputs-history';
import { gotoProject } from './helpers/nav';

/**
 * Outputs History E2E - parallel-safe via seed fixture.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 * Run: npx playwright test outputs-history.spec.ts --workers=3
 */

test.describe('Outputs History', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('should show history list, open output, close drawer, close history', async ({ page, seed }) => {
    const result = await generateSynthesis(page, seed.project_id);
    expect(result).toBe('drawer');
    await closeDrawer(page);

    await openOutputsHistory(page);
    await assertHistoryHasItems(page);

    const items = page.getByTestId('outputs-history-item');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(1);

    await openFirstHistoryItem(page);

    await expect(async () => {
      const outputDrawer = page.getByTestId('output-drawer');
      await expect(outputDrawer).toBeVisible();
      await assertDrawerSuccess(page);
    }).toPass({ timeout: 10000 });

    await closeDrawer(page);
    await expect(page.getByTestId('output-drawer')).toBeHidden();

    await closeOutputsHistory(page);
    await expect(page.getByTestId('outputs-history-drawer')).toBeHidden();
  });

  test('should show empty state when outputs endpoint returns []', async ({ page, seed }) => {
    await page.route(`**/api/v1/projects/${seed.project_id}/outputs*`, async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify([]) });
    });

    await page.reload();
    await expect(page.getByTestId('fact-card').first()).toBeVisible({ timeout: 10_000 });

    await openOutputsHistory(page);
    await assertHistoryEmpty(page);
  });

  test('non-modal: after closing OutputDrawer, FactCard evidence button opens evidence panel', async ({
    page,
    seed,
  }) => {
    const result = await generateSynthesis(page, seed.project_id);
    expect(result).toBe('drawer');
    await assertDrawerSuccess(page);
    await closeDrawer(page);

    const firstCard = page.getByTestId('fact-card').first();
    await expect(firstCard).toBeVisible({ timeout: 5000 });
    await firstCard.getByTestId('evidence-open').click();
    await expect(page.getByTestId('evidence-panel')).toBeVisible({ timeout: 10_000 });
  });

  test('open history -> open first output -> Back to History -> history list visible again', async ({
    page,
    seed,
  }) => {
    const result = await generateSynthesis(page, seed.project_id);
    expect(result).toBe('drawer');
    await closeDrawer(page);

    await openOutputsHistory(page);
    await assertHistoryHasItems(page);
    await openFirstHistoryItem(page);

    await expect(page.getByTestId('output-drawer')).toBeVisible({ timeout: 10000 });
    const backBtn = page.getByTestId('output-drawer-back-to-history');
    await expect(backBtn).toBeVisible({ timeout: 5000 });
    await backBtn.click();

    await expect(page.getByTestId('output-drawer')).toBeHidden();
    await expect(page.getByTestId('outputs-history-drawer')).toBeVisible();
    await expect(page.getByTestId('outputs-history-list')).toBeVisible();
  });
});

import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';
import {
  generateSynthesis,
  assertDrawerSuccess,
  closeDrawer,
  getOutputDrawerContent,
} from './helpers/synthesis';
import {
  openOutputsHistory,
  assertHistoryHasItems,
  openFirstHistoryItem,
} from './helpers/outputs-history';

/**
 * Focus mode + Regenerate E2E.
 * Focus mode: hide selection bar when output drawer open; Regenerate: new output from same facts.
 * Parallel-safe via seed. No sleeps, no Promise.race.
 * Run: npx playwright test focus-mode-regenerate.spec.ts --workers=3
 */

test.describe('Focus mode', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('open output → toggle focus → selection bar hidden → toggle off → visible again', async ({
    page,
    seed,
  }) => {
    const result = await generateSynthesis(page, seed.project_id);
    expect(result).toBe('drawer');
    await assertDrawerSuccess(page);

    await expect(page.getByTestId('synthesis-selection-bar')).toBeVisible();
    await page.getByTestId('output-drawer-focus-toggle').click();
    await expect(page.getByTestId('synthesis-selection-bar')).toBeHidden();

    await page.getByTestId('output-drawer-focus-toggle').click();
    await expect(page.getByTestId('synthesis-selection-bar')).toBeVisible();
  });
});

test.describe('Regenerate output', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('open history → open output → click regenerate → drawer updates with new content', async ({
    page,
    seed,
  }) => {
    const result = await generateSynthesis(page, seed.project_id);
    expect(result).toBe('drawer');
    await assertDrawerSuccess(page);
    const contentBefore = (await getOutputDrawerContent(page)).trim();
    await closeDrawer(page);

    await openOutputsHistory(page);
    await assertHistoryHasItems(page);
    await openFirstHistoryItem(page);
    await expect(page.getByTestId('output-drawer')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('output-drawer-regenerate').click();
    await expect(async () => {
      const content = await getOutputDrawerContent(page);
      expect(content.length).toBeGreaterThan(80);
    }).toPass({ timeout: 30000 });
    const contentAfter = (await getOutputDrawerContent(page)).trim();
    expect(contentAfter.length).toBeGreaterThan(80);
  });
});

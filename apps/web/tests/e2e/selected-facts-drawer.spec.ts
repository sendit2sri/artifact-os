import { test, expect } from './fixtures/seed';
import { gotoProject, switchToAllDataView } from './helpers/nav';
import {
  openSelectedFactsDrawer,
  assertSelectedFactsCount,
  removeFirstSelectedFact,
  clickSelectedFactsGenerate,
} from './helpers/selected-facts';
import { selectTwoFacts, ensureOutputDrawerAfterGenerate } from './helpers/synthesis';

/**
 * Selected Facts Drawer E2E - open drawer, assert count/items, remove one, generate.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 */

test.describe('Selected Facts Drawer', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('open drawer, assert count and items, remove one, count updates', async ({ page }) => {
    await switchToAllDataView(page);
    const card1 = page.getByTestId('fact-card').filter({ hasText: '[E2E:APPROVED-1]' });
    const card2 = page.getByTestId('fact-card').filter({ hasText: '[E2E:APPROVED-2]' });
    const card3 = page.getByTestId('fact-card').filter({ hasText: '[E2E:APPROVED-3]' });
    await expect(card1).toBeVisible({ timeout: 10000 });
    await card1.getByTestId('fact-select-button').click();
    await card2.getByTestId('fact-select-button').click();
    await card3.getByTestId('fact-select-button').click();

    await openSelectedFactsDrawer(page);

    await assertSelectedFactsCount(page, 3);
    await expect(page.getByTestId('selected-facts-item')).toHaveCount(3);

    await removeFirstSelectedFact(page);

    await expect(async () => {
      await assertSelectedFactsCount(page, 2);
    }).toPass({ timeout: 3000 });
    await expect(page.getByTestId('selected-facts-item')).toHaveCount(2);
  });

  test('click Generate opens output drawer with content length > 80', async ({ page }) => {
    await selectTwoFacts(page);
    await openSelectedFactsDrawer(page);
    await clickSelectedFactsGenerate(page);

    await ensureOutputDrawerAfterGenerate(page, 'merge', 30000);
    const content = page.getByTestId('output-drawer-content');
    await expect(content).toBeVisible();
    const text = (await content.textContent()) ?? '';
    expect(text.length).toBeGreaterThan(80);
  });
});

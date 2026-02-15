import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';
import {
  selectTwoFacts,
  clickGenerate,
  ensureOutputDrawerAfterGenerate,
  assertDrawerSuccess,
} from './helpers/synthesis';
import { waitForAppIdle } from './helpers/setup';

/**
 * Panels Pin E2E - pin keeps Output/Evidence open when opening other panels or changing selection.
 * Parallel-safe via seed fixture. No sleeps, no Promise.race.
 * Run: npx playwright test panels-pin.spec.ts --workers=3
 */

test.describe('Panels Pin', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('pin evidence keeps panel open when clicking next fact and updates evidence-fact-text', async ({
    page,
  }) => {
    const factCards = page.getByTestId('fact-card');
    await expect(factCards.first()).toBeVisible({ timeout: 10000 });

    await factCards.first().getByTestId('evidence-open').click();
    await expect(page.getByTestId('evidence-panel')).toBeVisible({ timeout: 8000 });
    const firstFactText = await page.getByTestId('evidence-fact-text').textContent();
    expect(firstFactText).toBeTruthy();

    await page.getByTestId('evidence-pin').click();

    // Use panel's Next to switch fact (panel covers cards; avoid clicking through overlay)
    await page.getByTestId('evidence-next').click();
    await expect(page.getByTestId('evidence-panel')).toBeVisible({ timeout: 5000 });
    await expect(async () => {
      const secondFactText = await page.getByTestId('evidence-fact-text').textContent();
      expect(secondFactText).toBeTruthy();
      expect(secondFactText).not.toBe(firstFactText);
    }).toPass({ timeout: 5000 });
  });

  test('pin output keeps drawer open when opening History drawer; both visible', async ({
    page,
  }) => {
    await selectTwoFacts(page);
    await clickGenerate(page);
    await ensureOutputDrawerAfterGenerate(page, 'merge');
    await assertDrawerSuccess(page);

    await page.getByTestId('output-drawer-pin').click();
    await waitForAppIdle(page);
    await expect(page.getByTestId('output-drawer-pin')).toHaveAttribute('data-pinned', 'true');

    await page.getByRole('button', { name: 'History' }).click();
    await expect(page.getByTestId('output-drawer')).toBeVisible();
    await expect(page.getByTestId('outputs-history-drawer')).toBeVisible();
  });
});

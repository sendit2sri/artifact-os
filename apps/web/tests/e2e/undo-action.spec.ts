/**
 * Undo Action E2E - Pin/Unpin, Approve, toast Undo restores previous state.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 * Run: npx playwright test undo-action.spec.ts --workers=3
 */

import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';
import { getFirstFactCard, getFactCard, clickApprove } from './helpers/fact-status';
import { waitForAppIdle } from './helpers/synthesis';

test.describe('Undo Action', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('pin fact → toast Undo → unpinned', async ({ page }) => {
    await page.getByTestId('view-tab-all').click();
    const card = getFirstFactCard(page);
    await expect(card).toBeVisible({ timeout: 10_000 });

    const pinBtn = card.getByTestId('fact-pin-toggle');
    await expect(pinBtn).toBeVisible();
    await pinBtn.click();
    await waitForAppIdle(page);

    await expect(async () => {
      await expect(card.getByTestId('fact-pin-state')).toHaveAttribute('data-pinned', 'true');
    }).toPass({ timeout: 5000 });

    const undoBtn = page.getByTestId('toast-undo');
    await expect(undoBtn).toBeVisible({ timeout: 3000 });
    await undoBtn.click();
    await waitForAppIdle(page);

    await expect(async () => {
      await expect(card.getByTestId('fact-pin-state')).toHaveAttribute('data-pinned', 'false');
    }).toPass({ timeout: 5000 });
  });

  test('approve fact → toast Undo → previous status restored', async ({ page }) => {
    await page.getByTestId('view-tab-all').click();
    const card = getFactCard(page, 1);
    await expect(card).toBeVisible({ timeout: 10_000 });
    const factId = await card.getAttribute('data-fact-id');

    await clickApprove(page, card);
    await waitForAppIdle(page);

    await expect(async () => {
      const approvedCard = page.getByTestId('fact-card').filter({
        has: page.getByTestId('fact-status-badge').filter({ hasText: /Approved/ }),
      }).first();
      await expect(approvedCard).toBeVisible();
    }).toPass({ timeout: 5000 });

    const undoBtn = page.getByTestId('toast-undo');
    await expect(undoBtn).toBeVisible({ timeout: 3000 });
    await undoBtn.click();
    await waitForAppIdle(page);

    const targetAfter = page.locator(`[data-testid="fact-card"][data-fact-id="${factId}"]`);
    await expect(targetAfter.getByTestId('fact-status-badge')).not.toContainText(/Approved/);
  });
});

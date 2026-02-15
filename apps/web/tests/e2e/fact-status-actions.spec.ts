import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';
import {
  getFirstFactCard,
  getFactCard,
  clickApprove,
  clickNeedsReview,
  clickFlag,
  clickClearStatus,
  assertCardHasStatusBadge,
  assertCardHasNoStatusBadge,
  getNeedsReviewCount,
} from './helpers/fact-status';
import { waitForAppIdle } from './helpers/setup';

/**
 * Fact Status Actions E2E - Approve / Needs Review / Flag / Clear + Undo, persistence, metrics.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 * Run: npx playwright test fact-status-actions.spec.ts --workers=3
 */

test.describe('Fact Status Actions', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('1) Approve: updates badge, persists after reload', async ({ page }) => {
    const card = getFirstFactCard(page);
    await expect(card).toBeVisible({ timeout: 10_000 });

    await clickApprove(page, card);

    // List may re-sort; find the card that has Approved badge
    const approvedCard = page.getByTestId('fact-card').filter({
      has: page.getByTestId('fact-status-badge').filter({ hasText: /Approved/ }),
    }).first();
    await expect(async () => {
      await assertCardHasStatusBadge(page, approvedCard, /Approved/);
    }).toPass({ timeout: 5000 });

    await page.reload();
    await expect(getFirstFactCard(page)).toBeVisible({ timeout: 10_000 });
    await assertCardHasStatusBadge(page, getFirstFactCard(page), /Approved/);
  });

  test('2) Needs Review: updates badge; needs-review count increments when KPI visible', async ({ page }) => {
    const card = getFactCard(page, 1);
    await expect(card).toBeVisible({ timeout: 10_000 });

    await clickNeedsReview(page, card);

    // List may re-sort (Needs review first), so the updated card can be first
    await expect(async () => {
      await assertCardHasStatusBadge(page, getFirstFactCard(page), /Needs Review/);
    }).toPass({ timeout: 5000 });

    await expect(async () => {
      const count = await getNeedsReviewCount(page);
      expect(count).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 3000 });
  });

  test('3) Flag: updates badge', async ({ page }) => {
    const card = page.getByTestId('fact-card').filter({ hasText: 'E2E_APPROVED_1' }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    await clickFlag(page, card);
    await waitForAppIdle(page);

    await expect(card.getByTestId('fact-status-badge')).toHaveText(/Flag/i);
  });

  test('4) Clear status: badge removed, persists after reload', async ({ page }) => {
    const marker = 'E2E_APPROVED_1';
    const card = page.getByTestId('fact-card').filter({ hasText: marker }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    await clickClearStatus(page, card);
    await waitForAppIdle(page);

    await expect(card.locator('[data-testid="fact-status-badge"]')).toHaveCount(0);

    await page.reload();
    const cardAfter = page.getByTestId('fact-card').filter({ hasText: marker }).first();
    await expect(cardAfter).toBeVisible({ timeout: 10_000 });
    await expect(cardAfter.locator('[data-testid="fact-status-badge"]')).toHaveCount(0);
  });
});

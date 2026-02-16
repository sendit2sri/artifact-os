import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';
import {
  approveFactByAnchor,
  needsReviewFactByAnchor,
  flagFactByAnchor,
  clearStatusByAnchor,
  badgeForAnchor,
  factCardByAnchor,
  FACT_ANCHORS,
} from './helpers/facts';
import { assertCardHasStatusBadge, getNeedsReviewCount } from './helpers/fact-status';

/**
 * Fact Status Actions E2E - Approve / Needs Review / Flag / Clear + persistence.
 * Uses anchor-based fact selection.
 */

test.describe('Fact Status Actions', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('1) Approve: updates badge, persists after reload', async ({ page }) => {
    await approveFactByAnchor(page, FACT_ANCHORS.PENDING_1);

    const badge = await badgeForAnchor(page, FACT_ANCHORS.PENDING_1);
    await expect(badge).toHaveText(/Approved/i);

    await page.reload();
    const cardAfter = await factCardByAnchor(page, FACT_ANCHORS.PENDING_1);
    await assertCardHasStatusBadge(page, cardAfter, /Approved/);
  });

  test('2) Needs Review: updates badge; needs-review count increments when KPI visible', async ({ page }) => {
    await needsReviewFactByAnchor(page, FACT_ANCHORS.APPROVED_1);

    const badge = await badgeForAnchor(page, FACT_ANCHORS.APPROVED_1);
    await expect(badge).toHaveText(/Needs Review/i);

    await expect(async () => {
      const count = await getNeedsReviewCount(page);
      expect(count).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 3000 });
  });

  test('3) Flag: updates badge', async ({ page }) => {
    await flagFactByAnchor(page, FACT_ANCHORS.APPROVED_1);

    const badge = await badgeForAnchor(page, FACT_ANCHORS.APPROVED_1);
    await expect(badge).toHaveText(/Flag/i);
  });

  test('4) Clear status: badge removed, persists after reload', async ({ page }) => {
    await clearStatusByAnchor(page, FACT_ANCHORS.APPROVED_1);

    const card = await factCardByAnchor(page, FACT_ANCHORS.APPROVED_1);
    await expect(card.getByTestId('fact-status-badge')).toHaveCount(0);

    await page.reload();
    const cardAfter = await factCardByAnchor(page, FACT_ANCHORS.APPROVED_1);
    await expect(cardAfter.getByTestId('fact-status-badge')).toHaveCount(0);
  });
});

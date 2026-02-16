import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';
import { approveFactByAnchor, badgeForAnchor, factCardByAnchor, FACT_ANCHORS } from './helpers/facts';

/**
 * Fact status E2E - Approve button updates state and persists.
 * Uses anchor-based fact selection.
 */

test.describe('Fact Status', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('Approve button updates fact state and persists after reload', async ({ page }) => {
    await approveFactByAnchor(page, FACT_ANCHORS.PENDING_1);

    const badge = await badgeForAnchor(page, FACT_ANCHORS.PENDING_1);
    await expect(badge).toHaveText(/Approved/i);

    await page.reload();
    const cardAfter = await factCardByAnchor(page, FACT_ANCHORS.PENDING_1);
    await expect(cardAfter).toContainText(/Approved/);
  });
});

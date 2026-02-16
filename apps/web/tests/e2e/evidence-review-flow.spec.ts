import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';
import {
  openEvidenceForFirstAnchorWithNext,
  badgeForAnchor,
  FACT_ANCHORS,
} from './helpers/facts';
import { waitForAppIdle } from './helpers/setup';

/**
 * Evidence Review Flow E2E - open evidence, toggle auto-advance, approve → next fact, assert badge.
 * Uses anchor-with-next helper for sort/group stability.
 */

test.describe('Evidence Review Flow', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('open evidence for first fact, toggle auto-advance ON, approve → next fact, badge updated', async ({
    page,
  }) => {
    await page.getByTestId('view-tab-all').click();
    const anchor = await openEvidenceForFirstAnchorWithNext(page, [
      FACT_ANCHORS.NEEDS_REVIEW_1,
      FACT_ANCHORS.APPROVED_1,
      FACT_ANCHORS.APPROVED_2,
      FACT_ANCHORS.PENDING_1,
    ]);

    await expect(page.getByTestId('evidence-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('evidence-review-bar')).toBeVisible({ timeout: 3000 });

    const autoAdvance = page.getByTestId('evidence-auto-advance-toggle');
    await expect(autoAdvance).toBeVisible();
    if (!(await autoAdvance.isChecked())) {
      await autoAdvance.check();
    }
    await expect(autoAdvance).toBeChecked();

    const firstFactText = await page.getByTestId('evidence-fact-text').textContent();

    await page.getByTestId('evidence-review-approve').click();
    await waitForAppIdle(page);

    // Verify mutation persisted before checking navigation
    const badge = await badgeForAnchor(page, anchor);
    await expect(badge).toContainText(/Approved/i);

    await expect(async () => {
      const factTextNow = await page.getByTestId('evidence-fact-text').textContent();
      expect(factTextNow).not.toBe(firstFactText);
    }).toPass({ timeout: 5000 });
  });
});

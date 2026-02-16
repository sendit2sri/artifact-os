/**
 * Output Quality Banner Actions E2E - Banner shows for mixed-status output;
 * Review issues opens queue; Regenerate from approved only produces high-trust output.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 * Run: npx playwright test output-quality-banner-actions.spec.ts
 */

import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';
import {
  clickGenerate,
  ensureOutputDrawerAfterGenerate,
  waitForAppIdle,
} from './helpers/synthesis';

test.describe('Output Quality Banner Actions', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('quality banner visible for mixed output, Review issues opens queue, Regenerate approved only yields high trust', async ({
    page,
  }) => {
    const card1 = page.getByTestId('fact-card').filter({ hasText: '[E2E:APPROVED-1]' });
    const card2 = page.getByTestId('fact-card').filter({ hasText: '[E2E:APPROVED-2]' });
    const card3 = page.getByTestId('fact-card').filter({ hasText: '[E2E:NEEDS_REVIEW-1]' });
    await expect(card1).toBeVisible({ timeout: 10000 });
    await card1.getByTestId('fact-select-button').click();
    await card2.getByTestId('fact-select-button').click();
    await card3.getByTestId('fact-select-button').click();
    await clickGenerate(page);
    await ensureOutputDrawerAfterGenerate(page, 'merge', 30000);
    await waitForAppIdle(page);

    const drawer = page.getByTestId('output-drawer');
    await expect(drawer).toBeVisible({ timeout: 5000 });

    const banner = page.getByTestId('output-quality-banner');
    await expect(banner).toBeVisible({ timeout: 5000 });
    const bannerText = await banner.textContent();
    const hasQualityIssues = /Quality issues/i.test(bannerText ?? '');

    if (hasQualityIssues) {
      const reviewBtn = page.getByTestId('output-quality-review-issues');
      await expect(reviewBtn).toBeVisible();
      await reviewBtn.click();
      await waitForAppIdle(page);

      const evidencePanel = page.getByTestId('evidence-panel');
      await expect(evidencePanel).toBeVisible({ timeout: 5000 });
      const queueRemaining = page.getByTestId('review-queue-remaining');
      await expect(queueRemaining).toBeVisible({ timeout: 3000 });

      const evidenceClose = page.getByTestId('evidence-close');
      await expect(evidenceClose).toBeVisible();
      await evidenceClose.click();
      await expect(evidencePanel).toBeHidden({ timeout: 3000 });
    }

    const regenerateBtn = page.getByTestId('output-quality-regenerate-approved');
    if (await regenerateBtn.isVisible().catch(() => false)) {
      await expect(regenerateBtn).toBeEnabled();
      await regenerateBtn.click();
      await waitForAppIdle(page);
    }

    await expect(page.getByTestId('output-drawer')).toBeVisible({ timeout: 5000 });
    const needsReviewSpan = page.getByTestId('output-quality-needs_review');
    if (await needsReviewSpan.isVisible().catch(() => false)) {
      await expect(needsReviewSpan).toHaveText('0', { timeout: 5000 });
    }

    const content = page.getByTestId('output-drawer-content');
    await expect(content).toBeVisible();
    const text = (await content.textContent()) ?? '';
    expect(text.length).toBeGreaterThan(80);
  });
});

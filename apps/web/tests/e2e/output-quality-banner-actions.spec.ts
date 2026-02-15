/**
 * Output Quality Banner Actions E2E - Banner shows for mixed-status output;
 * Review issues opens queue; Regenerate from approved only produces high-trust output.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 * Run: npx playwright test output-quality-banner-actions.spec.ts
 */

import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';
import { clickGenerate } from './helpers/synthesis';

test.describe('Output Quality Banner Actions', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('quality banner visible for mixed output, Review issues opens queue, Regenerate approved only yields high trust', async ({
    page,
  }) => {
    const factCards = page.getByTestId('fact-card');
    await expect(factCards.first()).toBeVisible({ timeout: 10000 });
    await factCards.nth(0).getByTestId('fact-select-button').click();
    await factCards.nth(2).getByTestId('fact-select-button').click();
    await factCards.nth(3).getByTestId('fact-select-button').click();
    await clickGenerate(page);

    const drawer = page.getByTestId('output-drawer');
    await expect(drawer).toBeVisible({ timeout: 15000 });

    const banner = page.getByTestId('output-quality-banner');
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner).toContainText('Quality issues', { timeout: 3000 });

    const reviewBtn = page.getByTestId('output-quality-review-issues');
    await expect(reviewBtn).toBeVisible();
    await reviewBtn.click();

    const evidencePanel = page.getByTestId('evidence-panel');
    await expect(evidencePanel).toBeVisible({ timeout: 5000 });
    const queueRemaining = page.getByTestId('review-queue-remaining');
    await expect(queueRemaining).toBeVisible({ timeout: 3000 });

    const evidenceClose = page.getByTestId('evidence-close');
    await expect(evidenceClose).toBeVisible();
    await evidenceClose.click();
    await expect(evidencePanel).toBeHidden({ timeout: 3000 });

    const regenerateBtn = page.getByTestId('output-quality-regenerate-approved');
    await expect(regenerateBtn).toBeVisible();
    await expect(regenerateBtn).toBeEnabled();
    await regenerateBtn.click();

    await expect(page.getByTestId('output-drawer')).toBeVisible({ timeout: 30000 });
    const needsReviewSpan = page.getByTestId('output-quality-needs_review');
    await expect(needsReviewSpan).toHaveText('0', { timeout: 5000 });

    const content = page.getByTestId('output-drawer-content');
    await expect(content).toBeVisible();
    const text = (await content.textContent()) ?? '';
    expect(text.length).toBeGreaterThan(80);
  });
});

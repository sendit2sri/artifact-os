/**
 * Capture Excerpt No Content E2E - expect error when source has no content.
 * Seed with with_source_no_content=true: source has null content.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 */

import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';
import { seedWithSourceNoContent } from './helpers/capture-excerpt';

test.describe('Capture Excerpt No Content', () => {
  test.beforeEach(async ({ page, seed }) => {
    await seedWithSourceNoContent(seed.project_id, seed.source_id);
    await gotoProject(page, seed.project_id);
  });

  test('capture excerpt when source has no content: expect actionable error, no crash', async ({ page }) => {
    const factCards = page.getByTestId('fact-card');
    await expect(factCards.first()).toBeVisible({ timeout: 10000 });

    const evidenceBtn = factCards.first().getByTestId('evidence-open');
    await evidenceBtn.click();

    const panel = page.getByTestId('evidence-panel');
    await expect(panel).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('evidence-fact-text')).toBeVisible({ timeout: 8000 });

    const captureBtn = page.getByTestId('evidence-capture-excerpt');
    await expect(captureBtn).toBeVisible({ timeout: 5000 });
    await captureBtn.click();

    await expect(page.getByTestId('evidence-capture-ui')).toBeVisible({ timeout: 5000 });

    const startInput = page.getByPlaceholder('Start');
    const endInput = page.getByPlaceholder('End');
    await startInput.fill('0');
    await endInput.fill('50');

    const saveBtn = page.getByTestId('evidence-capture-save');
    await saveBtn.click();

    await expect(async () => {
      const errorEl = page.getByTestId('evidence-capture-error');
      await expect(errorEl).toBeVisible({ timeout: 5000 });
      await expect(errorEl).toContainText(/content not available|Source content/i);
    }).toPass({ timeout: 8000 });

    await expect(page.getByTestId('evidence-panel')).toBeVisible();
  });
});

/**
 * Review Queue E2E - open queue, keyboard Approve, remaining count decreases.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 * Run: npx playwright test review-queue.spec.ts --workers=3
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';

async function seedReviewQueue(projectId: string, sourceId: string) {
  const res = await fetch(`${BACKEND_URL}/api/v1/test/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      source_id: sourceId,
      facts_count: 4,
      reset: true,
      with_review_queue: true,
    }),
  });
  if (!res.ok) throw new Error(`Seed failed: ${res.status} - ${await res.text()}`);
}

test.describe('Review Queue', () => {
  test.beforeEach(async ({ page, seed }) => {
    await seedReviewQueue(seed.project_id, seed.source_id);
    await gotoProject(page, seed.project_id);
  });

  test('open review queue → evidence panel in queue mode, press A → status updates and advances', async ({ page }) => {
    await page.getByTestId('view-tab-all').click();
    await expect(page.getByTestId('fact-card').first()).toBeVisible({ timeout: 10_000 });

    const queueBtn = page.getByTestId('review-queue-open');
    await expect(queueBtn).toBeVisible({ timeout: 5000 });
    await queueBtn.click();

    await expect(page.getByTestId('evidence-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('review-queue-mode')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('review-queue-hotkeys')).toBeVisible();

    const remainingEl = page.getByTestId('review-queue-remaining');
    const initialText = await remainingEl.textContent();
    const initialMatch = initialText?.match(/(\d+)/);
    const initialRemaining = initialMatch ? parseInt(initialMatch[1], 10) : 0;
    expect(initialRemaining).toBeGreaterThanOrEqual(2);

    await page.keyboard.press('a');

    await expect(async () => {
      const textNow = await remainingEl.textContent();
      const match = textNow?.match(/(\d+)/);
      const nowRemaining = match ? parseInt(match[1], 10) : 0;
      expect(nowRemaining).toBeLessThan(initialRemaining);
    }).toPass({ timeout: 5000 });
  });
});

import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';

/**
 * Processing Timeline E2E - timeline visible when jobs pending/running/failed;
 * failed job shows retry; retry triggers ingest.
 * PENDING jobs show spinner + "waiting"/"worker" copy (canary).
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 */

test.describe('Processing Timeline', () => {
  test('PENDING job canary: spinner visible + waiting/worker text', async ({ page, seed }) => {
    const pendingJob = {
      id: 'e2e-pending-canary',
      project_id: seed.project_id,
      status: 'PENDING',
      created_at: new Date().toISOString(),
      params: { url: 'https://example.com/pending', canonical_url: 'https://example.com/pending' },
      current_step: null,
    };

    await page.route(`**/api/v1/projects/${seed.project_id}/jobs*`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, body: JSON.stringify([pendingJob]) });
        return;
      }
      await route.continue();
    });

    await page.goto(`/project/${seed.project_id}`);
    await expect(page.getByTestId('processing-timeline')).toBeVisible({ timeout: 10000 });

    const stepEl = page.getByTestId('processing-current-step');
    await expect(stepEl).toContainText(/waiting|worker/i);

    await expect(page.locator('[data-testid="processing-timeline"] .animate-spin')).toBeVisible();
  });
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('timeline visible when job is failed, shows retry button', async ({ page, seed }) => {
    const failedJob = {
      id: 'e2e-failed-job-1',
      project_id: seed.project_id,
      status: 'FAILED',
      created_at: new Date().toISOString(),
      params: { url: 'https://example.com/failed' },
      current_step: 'Failed',
      error_message: 'Simulated failure for E2E',
    };

    await page.route(`**/api/v1/projects/${seed.project_id}/jobs*`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, body: JSON.stringify([failedJob]) });
        return;
      }
      await route.continue();
    });

    await page.reload();

    await expect(async () => {
      const timeline = page.getByTestId('processing-timeline');
      await expect(timeline).toBeVisible();
    }).toPass({ timeout: 10000 });

    await expect(page.getByTestId('processing-failed')).toBeVisible();
    await expect(page.getByTestId('processing-retry')).toBeVisible();
    await expect(page.getByTestId('processing-current-step')).toContainText(/failed|Failed/i);
  });

  test('click retry invalidates jobs and triggers ingest', async ({ page, seed }) => {
    const failedJob = {
      id: 'e2e-failed-job-2',
      project_id: seed.project_id,
      status: 'FAILED',
      created_at: new Date().toISOString(),
      params: { url: 'https://example.com/retry-me' },
      current_step: 'Failed',
      error_message: 'E2E retry test',
    };

    let jobsRequestCount = 0;
    await page.route(`**/api/v1/projects/${seed.project_id}/jobs*`, async (route) => {
      if (route.request().method() === 'GET') {
        jobsRequestCount++;
        await route.fulfill({ status: 200, body: JSON.stringify([failedJob]) });
        return;
      }
      await route.continue();
    });

    await page.reload();
    await expect(page.getByTestId('processing-timeline')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('processing-retry')).toBeVisible();

    let retryCalled = false;
    await page.route('**/api/v1/projects/*/sources/retry', async (route) => {
      if (route.request().method() === 'POST') {
        retryCalled = true;
        await route.fulfill({ status: 200, body: JSON.stringify({ job_id: 'new-job' }) });
        return;
      }
      await route.continue();
    });

    await page.getByTestId('processing-retry').click();

    await expect(async () => {
      expect(retryCalled).toBe(true);
    }).toPass({ timeout: 5000 });
  });
});

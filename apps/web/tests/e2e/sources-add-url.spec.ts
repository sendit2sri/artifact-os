import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';
import {
  openUrlTab,
  addUrl,
  assertSourceListed,
  assertAddUrlError,
} from './helpers/sources';

/**
 * Sources Add URL E2E - parallel-safe via seed fixture.
 * Uses route interception to mock ingest API for deterministic behavior.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 * Run: npx playwright test sources-add-url.spec.ts --workers=3
 */

const MOCK_ADD_URL = 'https://example.com/e2e-add-source';
const MOCK_JOB_ID = 'e2e-mock-job-add';

test.describe('Sources Add URL', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('should add a URL source and show it in Active Sources', async ({ page, seed }) => {
    await openUrlTab(page);

    await page.route('**/api/v1/ingest', async (route) => {
      if (route.request().method() === 'POST') {
        const body = await route.request().postDataJSON();
        if (body?.url === MOCK_ADD_URL) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ job_id: MOCK_JOB_ID, id: MOCK_JOB_ID }),
          });
          return;
        }
      }
      await route.continue();
    });

    await page.route(`**/api/v1/projects/${seed.project_id}/jobs*`, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      const mockJob = {
        id: MOCK_JOB_ID,
        project_id: seed.project_id,
        status: 'COMPLETED',
        created_at: new Date().toISOString(),
        params: { url: MOCK_ADD_URL },
        result_summary: { source_title: 'E2E Add Source' },
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockJob]),
      });
    });

    await addUrl(page, MOCK_ADD_URL);

    await expect(async () => {
      await assertSourceListed(page, /example\.com/);
    }).toPass({ timeout: 10_000 });
  });

  test('should show inline error for invalid URL', async ({ page }) => {
    await openUrlTab(page);

    await addUrl(page, 'not-a-url');

    await assertAddUrlError(page, /invalid url/i);
  });
});

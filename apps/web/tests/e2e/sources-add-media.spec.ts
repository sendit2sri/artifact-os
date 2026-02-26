import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';

/**
 * Sources Add Media E2E - upload audio/video file, mock ingest API, assert Media badge.
 * Uses mobile viewport for add-source sheet. Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true.
 * Run: npx playwright test sources-add-media.spec.ts
 */

const MOCK_JOB_ID = 'e2e-mock-job-media';

test.use({ viewport: { width: 390, height: 844 } });

test.describe('Sources Add Media', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('should upload media file and show source with Media badge', async ({ page, seed }) => {
    await expect(page.getByTestId('add-source-open')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('add-source-open').click();
    await expect(page.getByTestId('add-source-sheet')).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /^Upload$/ }).click();
    await page.waitForTimeout(300);

    const buffer = Buffer.alloc(100, 0);
    const fileInput = page.locator('input[type="file"]').first();

    await page.route('**/api/v1/ingest/file*', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: MOCK_JOB_ID, status: 'PENDING' }),
        });
        return;
      }
      await route.continue();
    });

    await page.route(`**/api/v1/projects/${seed.project_id}/jobs*`, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: MOCK_JOB_ID, project_id: seed.project_id, status: 'COMPLETED', params: { filename: 'test.mp3', source_type: 'MEDIA' }, result_summary: { source_title: 'test.mp3', source_type: 'MEDIA', facts_count: 2 } },
        ]),
      });
    });

    await fileInput.setInputFiles({ name: 'test.mp3', mimeType: 'audio/mpeg', buffer });
    await page.getByRole('button', { name: /Upload/ }).filter({ has: page.locator('svg') }).click();

    await page.getByTestId('sources-drawer-open').click({ timeout: 5000 });
    await expect(page.getByTestId('source-type-badge').filter({ hasText: 'Media' })).toBeVisible({ timeout: 8000 });
  });
});

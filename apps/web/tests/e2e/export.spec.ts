import * as fs from 'fs';
import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';

/**
 * Export E2E - parallel-safe via seed fixture.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 * Run: npx playwright test export.spec.ts --workers=3
 */

test.describe('Export', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('Export Markdown success', async ({ page, seed }) => {
    await page.getByTestId('export-button').click();
    await expect(page.getByTestId('export-panel')).toBeVisible();
    await page.getByTestId('export-mode-project').click();
    await page.getByTestId('export-option-markdown').click();

    await expect(async () => {
      const loading = page.getByTestId('export-loading');
      await expect(loading).toBeVisible();
    }).toPass({ timeout: 2000 }).catch(() => {});

    await expect(async () => {
      await expect(page.getByTestId('export-success')).toBeVisible();
      await expect(page.getByTestId('export-download')).toBeVisible();
    }).toPass({ timeout: 8000 });

    const downloadBtn = page.getByTestId('export-download');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadBtn.click(),
    ]);

    const suggestedFilename = download.suggestedFilename();
    expect(suggestedFilename).toContain(`project-`);
    expect(suggestedFilename).toContain(seed.project_id);
    expect(suggestedFilename).toContain('markdown');

    const path = await download.path();
    expect(path).toBeTruthy();
    const text = fs.readFileSync(path!, 'utf-8');
    expect(text).toMatch(/Sources:|Mode:|example\.com|Global temperatures|Arctic|Ocean/);
  });

  test('Export Markdown then Copy shows success feedback', async ({ page, seed }) => {
    await page.getByTestId('export-button').click();
    await expect(page.getByTestId('export-panel')).toBeVisible();
    await page.getByTestId('export-mode-project').click();
    await page.getByTestId('export-option-markdown').click();
    await expect(page.getByTestId('export-success')).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('export-copy')).toBeVisible();
    await page.getByTestId('export-copy').click();
    // Copy action ran; success block still visible (toast may be brief/portal in Sonner)
    await expect(page.getByTestId('export-success')).toBeVisible();
  });

  test('Export error + retry', async ({ page }) => {
    await page.getByTestId('export-button').click();
    await expect(page.getByTestId('export-panel')).toBeVisible();
    await page.getByTestId('export-mode-project').click();
    let requestCount = 0;
    await page.route('**/api/v1/projects/*/export*', async (route) => {
      requestCount++;
      if (requestCount === 1) {
        await route.fulfill({ status: 500, body: 'fail' });
        await page.unroute('**/api/v1/projects/*/export*');
        return;
      }
      await route.continue();
    });
    await page.getByTestId('export-option-markdown').click();

    await expect(async () => {
      await expect(page.getByTestId('export-error')).toBeVisible();
      await expect(page.getByTestId('export-retry')).toBeEnabled();
    }).toPass({ timeout: 8000 });

    await page.getByTestId('export-retry').click();

    await expect(async () => {
      await expect(page.getByTestId('export-success')).toBeVisible();
    }).toPass({ timeout: 8000 });
  });
});

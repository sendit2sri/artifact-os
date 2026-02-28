import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';

/**
 * Export Quick Actions E2E - export seeded output (no synthesis), click triggers download.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true (seed creates outputs).
 */

test.describe('Export Quick Actions @release-gate', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('export last output markdown downloads (seeded output)', async ({ page, seed }) => {
    await expect(page.getByTestId('export-button')).toBeEnabled();
    await page.getByTestId('export-button').click();
    await expect(page.getByTestId('export-panel')).toBeVisible();
    await page.getByTestId('export-mode-last-output').click();
    const lastOutputBtn = page.getByTestId('export-last-output-md');
    await expect(lastOutputBtn).toBeVisible({ timeout: 5000 });
    await expect(lastOutputBtn).toBeEnabled();
    await lastOutputBtn.click();
    await expect(page.getByTestId('export-success')).toBeVisible({ timeout: 15000 });
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      page.getByTestId('export-download').click(),
    ]);
    const suggestedFilename = download.suggestedFilename();
    expect(suggestedFilename).toMatch(/^project-.+-output-.+\.md$/);
    expect(suggestedFilename).toContain(seed.project_id);
  });
});

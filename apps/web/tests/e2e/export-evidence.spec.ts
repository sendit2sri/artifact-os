import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';

/**
 * Export with Evidence E2E - export facts CSV with evidence, assert content has evidence_snippet column.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 */

test.describe('Export with Evidence', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('export facts CSV with evidence, downloaded content contains evidence_snippet column and snippet', async ({ page }) => {
    await page.getByTestId('export-button').click();
    await expect(page.getByTestId('export-panel')).toBeVisible();
    await page.getByTestId('export-mode-project').click();
    const csvEvidenceBtn = page.getByTestId('export-facts-csv-evidence');
    await expect(csvEvidenceBtn).toBeVisible({ timeout: 5000 });
    await expect(csvEvidenceBtn).toBeEnabled();

    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/export') && r.url().includes('csv_evidence') && r.status() === 200, { timeout: 15000 }),
      csvEvidenceBtn.click(),
    ]);
    const body = await resp.text();
    expect(body).toContain('evidence_snippet');
    expect(body).toMatch(/global temperatures|Arctic|Ocean|Recent studies/);
  });
});

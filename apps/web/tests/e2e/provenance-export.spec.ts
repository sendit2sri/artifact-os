/**
 * Provenance Export E2E - Export output with Facts Used + Sources.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 * Run: npx playwright test provenance-export.spec.ts --workers=3
 */

import { test, expect } from './fixtures/seed';
import { generateSynthesis, assertDrawerSuccess } from './helpers/synthesis';
import { gotoProject } from './helpers/nav';

test.describe('Provenance Export', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('open output drawer, click Export with provenance, assert filename preview and download', async ({
    page,
    seed,
  }) => {
    const result = await generateSynthesis(page, seed.project_id);
    expect(result).toBe('drawer');
    await assertDrawerSuccess(page);

    const exportBtn = page.getByTestId('output-export-provenance');
    await expect(exportBtn).toBeVisible({ timeout: 5000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });

    await exportBtn.click();

    const download = await downloadPromise;
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/_provenance\.md$/);

    await expect(async () => {
      await expect(page.getByTestId('output-export-provenance-filename-preview')).toContainText('_provenance.md');
    }).toPass({ timeout: 5000 });

    const path = await download.path();
    expect(path).toBeTruthy();
    const fs = await import('fs');
    const content = fs.readFileSync(path!, 'utf-8');
    expect(content).toContain('Facts Used');
    expect(content).toContain('Sources');
  });
});

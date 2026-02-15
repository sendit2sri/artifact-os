import { test, expect } from './fixtures/seed';
import { gotoProject, switchToAllDataView } from './helpers/nav';
import { seedWithSimilarFacts } from './helpers/collapse-similar';
import { selectTwoFacts, clickGenerate, ensureOutputDrawerAfterGenerate } from './helpers/synthesis';
import { ensureFactsControlsOpen } from './helpers/ui';

/**
 * Cluster Preview Generate E2E - with collapse on + grouped selection,
 * click Generate, expect cluster preview opens, confirm, output generated.
 */

test.describe('Cluster Preview Generate', () => {
  test.beforeEach(async ({ page, seed }) => {
    await seedWithSimilarFacts(seed.project_id, seed.source_id);
    await gotoProject(page, seed.project_id);
  });

  test('collapse on + grouped selection, Generate opens cluster preview, confirm, output drawer content > 80', async ({
    page,
  }) => {
    await switchToAllDataView(page);
    await expect(page.getByTestId('fact-card').first()).toBeVisible({ timeout: 10000 });

    await ensureFactsControlsOpen(page);
    const toggle = page.getByTestId('toggle-collapse-similar');
    await expect(toggle).toBeVisible();
    await toggle.check();

    await page.getByTestId('facts-group-trigger').click();
    await page.getByRole('option', { name: /Source/i }).click();

    await selectTwoFacts(page);
    await clickGenerate(page);

    await ensureOutputDrawerAfterGenerate(page, 'merge');
    const content = page.getByTestId('output-drawer-content');
    await expect(content).toBeVisible({ timeout: 5000 });
    const text = (await content.textContent()) ?? '';
    expect(text.length).toBeGreaterThan(80);
    expect(text).toContain('Sources:');
    expect(text).toContain('Mode:');
  });
});

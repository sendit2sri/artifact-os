import { test, expect } from './fixtures/seed';
import {
  selectTwoFacts,
  selectTwoFactsFromDifferentSources,
  clickGenerate,
  assertDrawerSuccess,
  assertDrawerHasSubstantiveBody,
  assertErrorState,
  openLastOutput,
  closeDrawer,
  generateSynthesis,
  setSynthesisFormat,
  getOutputDrawerContent,
  generateSplitSections,
  ensureOutputDrawerAfterGenerate,
} from './helpers/synthesis';
import { gotoProject } from './helpers/nav';

/**
 * Synthesis Flow E2E - CI-ready, parallel-safe via worker-scoped seed fixture.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 * Run: npx playwright test synthesis-flow.spec.ts --workers=3
 */

test.describe('Synthesis Flow @release-gate', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('generate synthesis → drawer opens with non-empty content', async ({ page, seed }) => {
    const result = await generateSynthesis(page, seed.project_id);
    expect(result).toBe('drawer');
    await assertDrawerSuccess(page);
    await assertDrawerHasSubstantiveBody(page);
  });
});

test.describe('Synthesis Flow @nightly', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('should show Last Output button after generation', async ({ page, seed }) => {
    const lastOutputBtn = page.getByTestId('last-output-button');
    const isDisabled = await lastOutputBtn.getAttribute('disabled');
    if (isDisabled === '' || isDisabled === 'disabled') {
      await generateSynthesis(page, seed.project_id);
      await closeDrawer(page);
    }
    await page.reload();
    await expect(page.getByTestId('fact-card').first()).toBeVisible({ timeout: 10_000 });
    await openLastOutput(page);
    await assertDrawerSuccess(page);
  });

  test('output types differ: Paragraph vs Script Outline produce different content', async ({ page }) => {
    await selectTwoFacts(page);
    await setSynthesisFormat(page, 'paragraph');
    await clickGenerate(page);
    await ensureOutputDrawerAfterGenerate(page, 'merge');
    const contentParagraph = await getOutputDrawerContent(page);
    expect(contentParagraph).toContain('Mode: paragraph');
    await closeDrawer(page);

    // Selection is still 2 facts; do not call selectTwoFacts again (would deselect)
    await setSynthesisFormat(page, 'script_outline');
    await clickGenerate(page);
    await ensureOutputDrawerAfterGenerate(page, 'merge');
    const contentOutline = await getOutputDrawerContent(page);
    expect(contentOutline).toContain('Mode: script_outline');
    expect(contentOutline).not.toBe(contentParagraph);
  });

  test('Generate Separate Sections produces sectioned output', async ({ page, seed }) => {
    await generateSplitSections(page, seed.project_id);
    const content = await getOutputDrawerContent(page);
    expect(content).toContain('## Section');
    expect(content).toMatch(/Mode: split_sections|Mode: split/);
  });
});

test('empty synthesis response: UI hydrates via fetchOutput and shows content length > 80', async ({
    page,
    seed,
  }) => {
    const mockOutputId = 'hydrate-mock-output';
    const mockContent =
      'Sources: example.com\nMode: paragraph\n\nThis is hydrated output content when backend returns empty synthesis but valid output_id. Length must exceed 80 characters.';
    await page.route(`**/api/v1/projects/${seed.project_id}/synthesize`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ output_id: mockOutputId, synthesis: '', clusters: [] }),
      });
    });
    await page.route(`**/api/v1/outputs/${mockOutputId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: mockOutputId,
          content: mockContent,
          mode: 'paragraph',
          output_type: 'paragraph',
          title: 'Hydrated',
          source_count: 1,
          fact_ids: [],
          created_at: new Date().toISOString(),
        }),
      });
    });

    await gotoProject(page, seed.project_id);
    await selectTwoFacts(page);
    await clickGenerate(page);
    await ensureOutputDrawerAfterGenerate(page, 'merge', 20000);

    await expect(page.getByTestId('synthesis-error-banner')).toBeHidden();
    const content = await getOutputDrawerContent(page);
    expect(content.length).toBeGreaterThan(80);
    expect(content.trim()).toBe(mockContent.trim());
  });

test.describe('Synthesis Flow - Force Error', () => {
  test('should show error banner when synthesis fails (force_error)', async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);

    await page.waitForFunction(
      () => typeof (window as any).__e2e?.setForceNextSynthesisError === 'function',
      { timeout: 10000 }
    );
    await page.evaluate(() => {
      (window as any).__e2e.setForceNextSynthesisError(true);
    });

    await selectTwoFacts(page);
    await clickGenerate(page);
    await ensureOutputDrawerAfterGenerate(page, 'merge').catch(() => {});
    await expect(page.getByTestId('synthesis-error-banner')).toBeVisible({ timeout: 30000 });
    await assertErrorState(page, /LLM returned empty synthesis/i);
  });

  test('should allow retry after synthesis error', async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);

    await page.waitForFunction(
      () => typeof (window as any).__e2e?.setForceNextSynthesisError === 'function',
      { timeout: 10000 }
    );
    await page.evaluate(() => {
      (window as any).__e2e.setForceNextSynthesisError(true);
    });

    await selectTwoFacts(page);
    await clickGenerate(page);
    await ensureOutputDrawerAfterGenerate(page, 'merge').catch(() => {});
    await expect(page.getByTestId('synthesis-error-banner')).toBeVisible({ timeout: 30000 });
    await assertErrorState(page, /LLM returned empty synthesis/i);

    await page.getByTestId('synthesis-error-retry').click();
    await ensureOutputDrawerAfterGenerate(page, 'merge');
    await assertDrawerSuccess(page);
    await assertDrawerHasSubstantiveBody(page);
    await expect(page.getByTestId('synthesis-error-banner')).toBeHidden();
  });
});

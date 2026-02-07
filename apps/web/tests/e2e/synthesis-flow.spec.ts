import { test, expect } from './fixtures/seed';
import {
  selectTwoFacts,
  clickGenerate,
  waitForSynthesisResult,
  assertDrawerSuccess,
  assertErrorState,
  openLastOutput,
  closeDrawer,
  generateSynthesis,
} from './helpers/synthesis';

/**
 * Synthesis Flow E2E - CI-ready, parallel-safe via worker-scoped seed fixture.
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 * Run: npx playwright test synthesis-flow.spec.ts --workers=3
 */

test.describe('Synthesis Flow', () => {
  test.beforeEach(async ({ page, seed }) => {
    await page.goto(`/project/${seed.project_id}`);
    await page.waitForSelector('[data-testid="fact-card"]', { timeout: 10000 });
  });

  test('should generate synthesis and open OutputDrawer', async ({ page }) => {
    const result = await generateSynthesis(page);
    expect(result).toBe('drawer');
    await assertDrawerSuccess(page);
  });

  test('should show Last Output button after generation', async ({ page }) => {
    const lastOutputBtn = page.locator('button', { hasText: /Last Output/i });
    const isDisabled = await lastOutputBtn.getAttribute('disabled');
    if (isDisabled === '' || isDisabled === 'disabled') {
      await generateSynthesis(page);
      await closeDrawer(page);
    }
    await page.reload();
    await page.waitForSelector('[data-testid="fact-card"]', { timeout: 10000 });
    await openLastOutput(page);
    await assertDrawerSuccess(page);
  });
});

test.describe('Synthesis Flow - Force Error', () => {
  test('should show error banner when synthesis fails (force_error)', async ({ page, seed }) => {
    await page.goto(`/project/${seed.project_id}`);
    await page.waitForSelector('[data-testid="fact-card"]', { timeout: 10000 });

    await page.route(`**/api/v1/projects/${seed.project_id}/synthesize`, async (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set('force_error', 'true');
      await route.continue({ url: url.toString() });
    });

    await selectTwoFacts(page);
    await clickGenerate(page);
    const result = await waitForSynthesisResult(page);
    expect(result).toBe('error');
    await assertErrorState(page, /LLM returned empty synthesis/i);
  });
});

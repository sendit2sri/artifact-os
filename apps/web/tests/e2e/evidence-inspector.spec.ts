import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';
import {
  selectFirstFact,
  assertEvidenceForFact,
  nextEvidence,
  prevEvidence,
  closeEvidence,
} from './helpers/evidence';

/**
 * Evidence Panel E2E Tests (legacy file: evidence-inspector.spec.ts)
 *
 * Tests the EvidencePanelSimple Sheet UI: open on fact click, fact text/domain/URL,
 * Prev/Next navigation, boundary behavior, close.
 *
 * Prerequisites: ARTIFACT_ENABLE_TEST_SEED=true, ARTIFACT_E2E_MODE=true.
 * Run: npx playwright test evidence-inspector.spec.ts --workers=3
 */

test.describe('Evidence Panel', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('should open panel on evidence-open click and show fact text, domain, URL', async ({
    page,
  }) => {
    await selectFirstFact(page);

    await expect(async () => {
      const panel = page.getByTestId('evidence-panel');
      await expect(panel).toBeVisible();
      await assertEvidenceForFact(page, /Global temperatures|Arctic|Ocean|climate|fact/i, 'example.com');
    }).toPass({ timeout: 10_000 });

    const sourceUrl = page.getByTestId('evidence-source-url');
    await expect(sourceUrl).toBeVisible();
    await expect(sourceUrl).toHaveAttribute('href', /example\.com/);
  });

  test('should navigate with Prev/Next and disable at boundaries', async ({ page }) => {
    await selectFirstFact(page);

    await expect(page.getByTestId('evidence-panel')).toBeVisible({ timeout: 10_000 });

    const firstFactText = await page.getByTestId('evidence-fact-text').textContent();
    expect(firstFactText).toBeTruthy();

    await nextEvidence(page);
    await expect(async () => {
      const secondFactText = await page.getByTestId('evidence-fact-text').textContent();
      expect(secondFactText).toBeTruthy();
      expect(secondFactText).not.toBe(firstFactText);
    }).toPass({ timeout: 3000 });

    await prevEvidence(page);
    await expect(async () => {
      const backToFirst = await page.getByTestId('evidence-fact-text').textContent();
      expect(backToFirst).toBe(firstFactText);
    }).toPass({ timeout: 3000 });

    await expect(page.getByTestId('evidence-prev')).toBeDisabled();

    const factCount = await page.getByTestId('fact-card').count();
    const nextBtn = page.getByTestId('evidence-next');
    for (let i = 0; i < factCount - 1; i++) {
      await nextBtn.click();
    }
    await expect(nextBtn).toBeDisabled();
  });

  test('should close panel via evidence-close and reopen', async ({ page }) => {
    await selectFirstFact(page);

    await expect(page.getByTestId('evidence-panel')).toBeVisible({ timeout: 10_000 });

    await closeEvidence(page);

    await expect(page.getByTestId('evidence-panel')).toBeHidden();

    await selectFirstFact(page);

    await expect(async () => {
      await expect(page.getByTestId('evidence-panel')).toBeVisible();
      await assertEvidenceForFact(page, /Global temperatures|Arctic|Ocean|climate|fact/i, 'example.com');
    }).toPass({ timeout: 5000 });
  });
});

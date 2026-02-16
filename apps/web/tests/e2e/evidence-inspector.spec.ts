import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';
import {
  openEvidenceForAnchor,
  openEvidenceForFirstAnchorWithNext,
  FACT_ANCHORS,
} from './helpers/facts';
import {
  assertEvidenceForFact,
  nextEvidence,
  prevEvidence,
  closeEvidence,
} from './helpers/evidence';

/**
 * Evidence Panel E2E Tests (evidence-inspector.spec.ts)
 * Uses anchor-based fact selection.
 */

test.describe('Evidence Panel', () => {
  test.beforeEach(async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
  });

  test('should open panel on evidence-open click and show fact text, domain, URL', async ({
    page,
  }) => {
    await openEvidenceForAnchor(page, FACT_ANCHORS.APPROVED_1);

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
    await openEvidenceForFirstAnchorWithNext(page, [
      FACT_ANCHORS.APPROVED_2,
      FACT_ANCHORS.NEEDS_REVIEW_1,
      FACT_ANCHORS.PENDING_1,
      FACT_ANCHORS.APPROVED_1,
    ]);

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

    // Boundary: Prev disabled at start
    await expect(page.getByTestId('evidence-prev')).toBeDisabled();

    // Bounded: Next twice, Prev becomes enabled (no loop over all facts)
    await nextEvidence(page);
    await nextEvidence(page);
    await expect(page.getByTestId('evidence-prev')).toBeEnabled();
  });

  test('should close panel via evidence-close and reopen', async ({ page }) => {
    await openEvidenceForAnchor(page, FACT_ANCHORS.APPROVED_1);

    await expect(page.getByTestId('evidence-panel')).toBeVisible({ timeout: 10_000 });

    await closeEvidence(page);

    await expect(page.getByTestId('evidence-panel')).toBeHidden();

    await openEvidenceForAnchor(page, FACT_ANCHORS.APPROVED_1);

    await expect(async () => {
      await expect(page.getByTestId('evidence-panel')).toBeVisible();
      await assertEvidenceForFact(page, /Global temperatures|Arctic|Ocean|climate|fact/i, 'example.com');
    }).toPass({ timeout: 5000 });
  });
});

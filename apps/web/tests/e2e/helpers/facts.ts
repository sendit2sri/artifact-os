/**
 * Canonical fact picker API for E2E tests.
 * Always scope actions within a single fact card (anchor → card → actions).
 * Eliminates nth(), .first(), and full-text matches.
 */

import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { FACT_ANCHORS } from './known-facts';
import { waitForAppIdle } from './setup';

/**
 * Find the fact card container that contains the anchor text [anchor].
 * Returns a locator for the card root. Fails if not visible.
 */
export async function factCardByAnchor(page: Page, anchor: string): Promise<Locator> {
  const card = page.getByTestId('fact-card').filter({ hasText: `[${anchor}]` });
  await expect(card).toBeVisible({ timeout: 10_000 });
  return card;
}

/**
 * Open evidence panel by clicking evidence-open on the fact with the given anchor.
 * Waits for panel to be visible.
 */
export async function openEvidenceForAnchor(
  page: Page,
  anchor: string,
  options?: { timeout?: number }
): Promise<void> {
  const timeout = options?.timeout ?? 10_000;
  const card = await factCardByAnchor(page, anchor);
  const openBtn = card.getByTestId('evidence-open');
  await openBtn.scrollIntoViewIfNeeded();
  await openBtn.click();
  await expect(page.getByTestId('evidence-panel')).toBeVisible({ timeout });
}

/**
 * Open evidence for the first anchor that has a "next" fact in the current view.
 * Tries anchors in order; returns the chosen anchor. Stable across sort/group changes.
 */
export async function openEvidenceForFirstAnchorWithNext(
  page: Page,
  anchors: string[]
): Promise<string> {
  const { closeEvidence } = await import('./evidence');
  for (const anchor of anchors) {
    await openEvidenceForAnchor(page, anchor);
    const nextBtn = page.getByTestId('evidence-next');
    if (await nextBtn.isEnabled().catch(() => false)) {
      return anchor;
    }
    await closeEvidence(page);
  }
  throw new Error(
    `No anchor with evidence-next enabled among [${anchors.join(', ')}]. ` +
      'Current sort/group may put all tried anchors at list end.'
  );
}

/**
 * Click Approve on the fact with the given anchor.
 * Waits for app idle after click.
 */
export async function approveFactByAnchor(page: Page, anchor: string): Promise<void> {
  const card = await factCardByAnchor(page, anchor);
  const btn = card.getByTestId('fact-approve');
  await expect(btn).toBeVisible({ timeout: 5000 });
  await btn.click();
  await waitForAppIdle(page);
}

/**
 * Click Needs Review on the fact with the given anchor.
 */
export async function needsReviewFactByAnchor(page: Page, anchor: string): Promise<void> {
  const card = await factCardByAnchor(page, anchor);
  const btn = card.getByTestId('fact-needs-review');
  await expect(btn).toBeVisible({ timeout: 5000 });
  await btn.click();
  await waitForAppIdle(page);
}

/**
 * Click Flag on the fact with the given anchor.
 */
export async function flagFactByAnchor(page: Page, anchor: string): Promise<void> {
  const card = await factCardByAnchor(page, anchor);
  const btn = card.getByTestId('fact-flag');
  await expect(btn).toBeVisible({ timeout: 5000 });
  await btn.click();
  await waitForAppIdle(page);
}

/**
 * Click Clear status on the fact with the given anchor.
 */
export async function clearStatusByAnchor(page: Page, anchor: string): Promise<void> {
  const card = await factCardByAnchor(page, anchor);
  const btn = card.getByTestId('fact-clear-status');
  await expect(btn).toBeVisible({ timeout: 5000 });
  await btn.click();
  await waitForAppIdle(page);
}

/**
 * Return the status badge locator within the card for the given anchor.
 */
export async function badgeForAnchor(page: Page, anchor: string): Promise<Locator> {
  const card = await factCardByAnchor(page, anchor);
  return card.getByTestId('fact-status-badge');
}

export { FACT_ANCHORS };

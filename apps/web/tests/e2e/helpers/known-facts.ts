/**
 * Helpers for working with known fact IDs and anchors from seed.
 * Provides stable selectors that survive text changes, status updates, and UI reorganization.
 */

import type { Page, Locator } from '@playwright/test';

/**
 * Get a fact card by its known ID (from seed's known_fact_ids).
 * This is the most stable selector strategy - survives ALL UI changes.
 * 
 * @example
 * const approvedCard = getFactById(page, knownIds.approved_1);
 * await approvedCard.click();
 */
export function getFactById(page: Page, factId: string): Locator {
  return page.locator(`[data-fact-id="${factId}"]`);
}

/**
 * Get a fact card by its anchor text (E2E_APPROVED_1, etc.).
 * More readable than IDs in test code, but less stable if text changes.
 * 
 * @example
 * const approvedCard = getFactByAnchor(page, 'E2E_APPROVED_1');
 * await expect(approvedCard).toBeVisible();
 */
export function getFactByAnchor(page: Page, anchor: string): Locator {
  return page.getByTestId('fact-card').filter({ hasText: `[${anchor}]` });
}

/**
 * Known fact anchors from kitchen sink seed.
 * These anchors are embedded in fact_text and are stable across seed runs.
 */
export const FACT_ANCHORS = {
  APPROVED_1: 'E2E_APPROVED_1',
  APPROVED_2: 'E2E_APPROVED_2',
  PINNED_1: 'E2E_PINNED_1',
  DUPLICATE_ORIGINAL: 'E2E_DUPLICATE_ORIGINAL',
  DUPLICATE_SUPPRESSED: 'E2E_DUPLICATE_SUPPRESSED',
  SIMILAR_REP: 'E2E_SIMILAR_REP',
  NO_SNIPPET: 'E2E_NO_SNIPPET',
} as const;

/**
 * Type-safe interface for known_fact_ids returned from backend seed.
 */
export interface KnownFactIds {
  approved_1: string;
  approved_2: string;
  pinned_1: string;
  duplicate_original: string;
  duplicate_suppressed: string;
  similar_rep: string;
  no_snippet: string;
}

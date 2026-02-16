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
 * Get a fact card by its anchor text ([E2E:APPROVED-1], etc.).
 * More readable than IDs in test code, but less stable if text changes.
 *
 * @example
 * const approvedCard = getFactByAnchor(page, 'E2E:APPROVED-1');
 * await expect(approvedCard).toBeVisible();
 */
export function getFactByAnchor(page: Page, anchor: string): Locator {
  return page.getByTestId('fact-card').filter({ hasText: `[${anchor}]` });
}

/**
 * Known fact anchors from kitchen sink seed.
 * Format: [E2E:{STATUS}-{INDEX}] - embedded in fact_text, stable across seed runs.
 */
export const FACT_ANCHORS = {
  APPROVED_1: 'E2E:APPROVED-1',
  APPROVED_2: 'E2E:APPROVED-2',
  APPROVED_3: 'E2E:APPROVED-3',
  PINNED_1: 'E2E:PINNED-1',
  NEEDS_REVIEW_1: 'E2E:NEEDS_REVIEW-1',
  NEEDS_REVIEW_2: 'E2E:NEEDS_REVIEW-2',
  PENDING_1: 'E2E:PENDING-1',
  FLAGGED_1: 'E2E:FLAGGED-1',
  DUPLICATE_1: 'E2E:DUPLICATE-1',
  SIMILAR_1: 'E2E:SIMILAR-1',
  SIMILAR_2: 'E2E:SIMILAR-2',
  NO_SNIPPET_1: 'E2E:NO_SNIPPET-1',
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

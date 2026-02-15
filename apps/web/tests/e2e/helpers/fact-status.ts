/**
 * Fact Status E2E helpers - stable selectors only.
 * Uses: fact-status-badge, fact-clear-status, fact-approve, fact-needs-review, fact-flag, needs-review-count.
 */

import { Page, expect } from '@playwright/test';
import type { Locator } from '@playwright/test';

/** Get first fact card */
export function getFirstFactCard(page: Page) {
  return page.getByTestId('fact-card').first();
}

/** Get Nth fact card (0-based) */
export function getFactCard(page: Page, index: number) {
  return page.getByTestId('fact-card').nth(index);
}

/** Click Approve on a fact card */
export async function clickApprove(page: Page, card = getFirstFactCard(page)) {
  const btn = card.getByTestId('fact-approve');
  await expect(btn).toBeVisible({ timeout: 5000 });
  await btn.click();
}

/** Click Needs Review on a fact card */
export async function clickNeedsReview(page: Page, card = getFirstFactCard(page)) {
  const btn = card.getByTestId('fact-needs-review');
  await expect(btn).toBeVisible({ timeout: 5000 });
  await btn.click();
}

/** Click Flag on a fact card */
export async function clickFlag(page: Page, card = getFirstFactCard(page)) {
  const btn = card.getByTestId('fact-flag');
  await expect(btn).toBeVisible({ timeout: 5000 });
  await btn.click();
}

/** Click Clear status on a fact card (visible only when card has a status) */
export async function clickClearStatus(page: Page, card = getFirstFactCard(page)) {
  const btn = card.getByTestId('fact-clear-status');
  await expect(btn).toBeVisible({ timeout: 5000 });
  await btn.click();
}

/** Assert card has status badge with given text (Approved / Needs Review / Flagged) */
export async function assertCardHasStatusBadge(page: Page, card: ReturnType<typeof getFirstFactCard>, text: RegExp | string) {
  const badge = card.getByTestId('fact-status-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toContainText(text);
}

/** Assert card has no status badge (PENDING / cleared). Card can be any fact-card locator. */
export async function assertCardHasNoStatusBadge(page: Page, card: Locator = getFirstFactCard(page)) {
  await expect(card.getByTestId('fact-status-badge')).toHaveCount(0);
}

/** Get current needs-review count from KPI area */
export async function getNeedsReviewCount(page: Page): Promise<number> {
  const el = page.getByTestId('needs-review-count');
  const visible = await el.isVisible().catch(() => false);
  if (!visible) return 0;
  const text = await el.textContent();
  const match = text?.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

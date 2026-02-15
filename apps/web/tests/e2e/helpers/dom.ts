/**
 * DOM helpers for E2E — safe reads that never become test-timeout bombs.
 */

import type { Locator } from '@playwright/test';

/** Optional UI read: returns text or null, never waits beyond timeout. */
export async function tryText(locator: Locator, timeout = 250): Promise<string | null> {
  return locator.textContent({ timeout }).catch(() => null);
}

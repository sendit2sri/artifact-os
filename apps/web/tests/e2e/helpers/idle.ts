/**
 * E2E idle helpers - poll live React Query counters for deterministic waitForAppIdle.
 * Counters (rqFetchingCount, rqMutatingCount) are kept live via cache subscriptions in providers.tsx.
 */

import { expect, type Page } from '@playwright/test';

export interface WaitForAppIdleOptions {
  timeout?: number;
  /** If false, only wait for query idle (not jobs). Use for pages that expect active jobs. Default true. */
  requireNoActiveJobs?: boolean;
}

async function waitForE2EControls(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () =>
      typeof window.__e2e !== 'undefined' &&
      (typeof window.__e2e?.rqFetchingCount === 'number' ||
        typeof window.__e2e?.waitForIdle === 'function'),
    null,
    { timeout: 15000 }
  );
}

/**
 * Wait for app to be idle by polling live rqFetchingCount and rqMutatingCount until both are 0.
 * Uses window.__e2e counters kept live via React Query cache subscriptions in providers.tsx.
 */
export async function waitForAppIdle(
  page: Page,
  timeoutOrOpts: number | WaitForAppIdleOptions = 10000
): Promise<void> {
  const opts =
    typeof timeoutOrOpts === 'number'
      ? { timeout: timeoutOrOpts, requireNoActiveJobs: true }
      : { timeout: 10000, requireNoActiveJobs: true, ...timeoutOrOpts };
  const timeoutMs = opts.timeout ?? 10000;

  await waitForE2EControls(page);

  await expect(async () => {
    const result = await page.evaluate(
      (o: { requireNoActiveJobs: boolean }) => {
        const e2e = window.__e2e;
        if (!e2e || typeof e2e.rqFetchingCount === 'undefined') {
          return { idle: false, rqFetch: -1, rqMut: -1, url: location.href };
        }
        const rqFetch = e2e.rqFetchingCount ?? 0;
        const rqMut = e2e.rqMutatingCount ?? 0;
        const jobs = e2e.state?.jobs ?? [];
        const hasActiveJobs =
          o.requireNoActiveJobs &&
          jobs.some((j: { status: string }) => ['PENDING', 'RUNNING'].includes(j.status));
        const idle = rqFetch === 0 && rqMut === 0 && !hasActiveJobs;
        return { idle, rqFetch, rqMut, url: location.href };
      },
      { requireNoActiveJobs: opts.requireNoActiveJobs }
    );

    if (!result.idle) {
      throw new Error(
        `Not idle: rqFetchingCount=${result.rqFetch} rqMutatingCount=${result.rqMut} url=${result.url}`
      );
    }
  }).toPass({ timeout: timeoutMs + 1000 });
}

/**
 * Test setup helpers for E2E isolation.
 * Prevents cross-test state leakage in parallel execution.
 */

import { expect, type Page, type BrowserContext } from '@playwright/test';

export {
  waitForAppIdle,
  type WaitForAppIdleOptions,
} from './idle';

/**
 * Get E2E state for debugging failed tests. Call when a test fails to print diagnostics.
 */
export async function dumpE2EState(page: Page): Promise<string> {
  return page.evaluate(() => {
    const e2e = window.__e2e;
    if (!e2e) return '__e2e not exposed';
    const state = e2e.state ?? {};
    const jobs = state.jobs ?? [];
    const facts = state.facts ?? [];
    const pending = jobs.filter((j: { status: string }) => j.status === 'PENDING').length;
    const running = jobs.filter((j: { status: string }) => j.status === 'RUNNING').length;
    const failed = jobs.filter((j: { status: string }) => j.status === 'FAILED').length;
    return JSON.stringify({
      url: window.location.href,
      urlParams: window.location.search || undefined,
      phase: state.phase,
      jobs: { pending, running, failed, total: jobs.length },
      factsCount: facts.length,
      outputsCount: state.outputsCount ?? undefined,
      selectedCount: state.selectedCount,
    }, null, 2);
  });
}

/**
 * Assert at least one fact-card is visible. Calls waitForAppIdle(requireNoActiveJobs: true) first,
 * then asserts. On failure, dumps phase-aware diagnostics.
 */
export async function expectFactsVisible(page: Page, timeout = 10000): Promise<void> {
  try {
    await waitForAppIdle(page, { timeout, requireNoActiveJobs: true });
  } catch {
    // __e2e not exposed - continue to assert
  }
  const factCards = page.getByTestId('fact-card');
  try {
    await factCards.first().waitFor({ state: 'visible', timeout });
  } catch (err) {
    const diag = await dumpE2EState(page).catch(() => 'dump failed');
    const phase = await page.evaluate(() => window.__e2e?.state?.phase ?? 'unknown').catch(() => 'unknown');
    const jobs = await page.evaluate(() => {
      const j = window.__e2e?.state?.jobs ?? [];
      return { pending: j.filter((x: { status: string }) => x.status === 'PENDING').length, running: j.filter((x: { status: string }) => x.status === 'RUNNING').length };
    }).catch(() => ({ pending: -1, running: -1 }));
    const factsCount = await page.evaluate(() => (window.__e2e?.state?.facts ?? []).length).catch(() => -1);
    const hasErrorBoundary = await page.getByTestId('error-boundary').isVisible().catch(() => false);
    const hasErrorPage = await page.locator('text=/Something went wrong|something went wrong/i').isVisible().catch(() => false);
    const hasSkeleton = await page.locator('.animate-shimmer').first().isVisible().catch(() => false);
    const urlParamsSafe = await page.evaluate(() => {
      const allowlist = new Set(['view', 'sort', 'type', 'value', 'q', 'group', 'review_status', 'show_selected']);
      const p = new URLSearchParams(window.location.search);
      const entries: string[] = [];
      p.forEach((v, k) => { if (allowlist.has(k)) entries.push(`${k}=${v.slice(0, 20)}`); });
      return entries.length ? '?' + entries.join('&').slice(0, 50) : '';
    }).catch(() => '');
    let hint = 'fact-card not found';
    if (hasErrorBoundary) {
      hint = 'hint=error boundary visible';
    } else if (hasErrorPage) {
      hint = 'hint=error page shown';
    } else if (factsCount === 0 && (jobs.pending > 0 || jobs.running > 0)) {
      hint = `hint=jobs still running (pending=${jobs.pending ?? 0} running=${jobs.running ?? 0})`;
    } else if (factsCount === 0 && hasSkeleton) {
      hint = 'hint=facts not yet hydrated (skeleton visible)';
    } else if (factsCount === 0 && phase) {
      hint = `hint=seed empty (facts=0 phase=${phase})`;
    } else if (factsCount > 0 && (urlParamsSafe || phase)) {
      hint = `hint=URL filters active (scoped view${urlParamsSafe ? ` url=${urlParamsSafe}` : ''})`;
    }
    const activeEl = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? `${el.tagName}#${el.id || ''}.${(el.className || '').slice(0, 40)}` : 'none';
    }).catch(() => '?');
    console.error(hint, '\nactiveElement:', activeEl, '\nE2E state:', diag);
    throw err;
  }
}

/**
 * Dismiss all overlays/modals/sheets. Idempotent—safe to call when nothing is open.
 * Uses Escape only (no random clicks that could trigger tooltips).
 */
async function dismissOverlays(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  const errorBoundary = page.locator('[data-testid="error-boundary"]');
  if (await errorBoundary.isVisible().catch(() => false)) {
    console.warn('⚠️  Error boundary detected from previous test, reloading page...');
    await page.reload({ waitUntil: 'domcontentloaded' });
  }

  const palette = page.getByTestId('command-palette');
  if (await palette.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden({ timeout: 1000 });
  }

  const openOverlays = page.locator(
    '[data-testid="dialog-overlay"][data-state="open"], [data-state="open"][role="dialog"], [data-state="open"][data-radix-popper-content-wrapper]'
  );
  if ((await openOverlays.count()) > 0) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
  }

  // Radix Popover/Select sometimes remains open despite Escape. Use Escape + safe click outside
  // (avoids top-left nav/logo/clicks). Poll with backoff for CSS transitions.
  const delays = [60, 90, 120, 150, 180];
  for (let i = 0; i < delays.length; i++) {
    const result = await page.evaluate(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const els = document.querySelectorAll('[data-radix-popper-content-wrapper]');
      const visibleRects: DOMRect[] = [];
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) continue;
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || s.pointerEvents === 'none') continue;
        if (parseFloat(s.opacity) <= 0.01) continue;
        visibleRects.push(r);
      }
      if (visibleRects.length === 0) return { hasVisible: false as const, safePoint: null, rectsCount: 0 };
      const margin = 10;
      const candidates: [number, number][] = [
        [Math.round(margin), Math.round(vh - margin)],
        [Math.round(vw - margin), Math.round(vh - margin)],
        [Math.round(vw / 2), Math.round(vh - margin)],
        [Math.round(vw / 2), Math.round(vh / 2)],
      ];
      const inRect = (x: number, y: number, r: DOMRect) =>
        x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      for (const [x, y] of candidates) {
        if (!visibleRects.some((r) => inRect(x, y, r))) {
          return { hasVisible: true as const, safePoint: { x, y }, rectsCount: visibleRects.length };
        }
      }
      return { hasVisible: true as const, safePoint: { x: Math.round(vw / 2), y: Math.round(vh / 2) }, rectsCount: visibleRects.length };
    }).catch(() => ({ hasVisible: false as const, safePoint: null, rectsCount: 0 }));
    if (!result.hasVisible) break;
    await page.keyboard.press('Escape');
    if (result.safePoint) {
      await page.mouse.click(result.safePoint.x, result.safePoint.y);
      if (i === 0 || result.rectsCount > 1) {
        console.log(`dismissOverlays: visiblePoppers=${result.rectsCount} click=(${result.safePoint.x},${result.safePoint.y}) attempt=${i + 1} delay=${delays[i]}ms`);
      }
    }
    await page.waitForTimeout(delays[i]);
  }
}

/**
 * Clear browser storage to prevent cross-test leakage.
 * Safe: wraps all storage access in try/catch (avoids SecurityError on about:blank).
 */
export async function clearBrowserStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      localStorage.clear();
    } catch {}
    try {
      sessionStorage.clear();
    } catch {}

    try {
      if (window.caches) {
        caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
      }
    } catch {}

    try {
      if (navigator.serviceWorker) {
        navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
      }
    } catch {}
  });
}

/**
 * Clear React Query cache using E2E controls.
 */
export async function clearReactQueryCache(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (window.__e2e?.clearQueryCache) {
      window.__e2e.clearQueryCache();
    }
  });
}

/**
 * Setup clean state for test: clear storage, dismiss overlays, clear cache.
 * SAFE cleanup using user-level actions + reload fallback (not DOM removal).
 *
 * Call order:
 * 0. Ensure we have an origin (goto baseUrl if about:blank) — avoids SecurityError on localStorage
 * 1. Dismiss overlays (Escape + error boundary check)
 * 2. Clear storage (localStorage + Cache API + Service Workers)
 * 3. Clear React Query cache
 * 4. Reset scroll position
 * 5. Mark onboarding complete
 * 6. Wait for query idle
 */
export async function setupCleanTestState(page: Page): Promise<void> {
  // 0. Ensure we are on an origin before touching localStorage/sessionStorage (avoids SecurityError on about:blank)
  if (page.url() === 'about:blank') {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  }

  // 1. Dismiss overlays using safe user-level actions
  await dismissOverlays(page);

  // 2. Clear all browser storage
  await clearBrowserStorage(page);

  // 3. Clear React Query cache (if E2E mode)
  await clearReactQueryCache(page);

  // 4. Reset scroll position
  await page.evaluate(() => window.scrollTo(0, 0));

  // 5. Set onboarding complete
  await page.evaluate(() => {
    try {
      localStorage.setItem('artifact_onboarding_completed_v1', 'true');
    } catch {}
  });

  // 6. Wait for query idle (don't require no jobs—cleanup may run during ingestion)
  try {
    await waitForAppIdle(page, { timeout: 5000, requireNoActiveJobs: false });
  } catch {
    // Ignore if not yet on a page with __e2e controls
  }
}

/**
 * Ensure clipboard permissions are granted for tests that copy/paste.
 * Playwright config already grants permissions, but this helper explicitly
 * grants at context level and verifies clipboard API is available.
 * 
 * Call in test.beforeEach for tests that use clipboard.
 */
export async function ensureClipboardPermissions(page: Page): Promise<void> {
  // Grant clipboard permissions explicitly at context level
  const context = page.context();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  
  // Verify clipboard API is available
  const hasClipboard = await page.evaluate(() => {
    return typeof navigator.clipboard !== 'undefined' &&
           typeof navigator.clipboard.writeText === 'function' &&
           typeof navigator.clipboard.readText === 'function';
  });
  
  if (!hasClipboard) {
    throw new Error('Clipboard API not available in browser context');
  }
}

/**
 * Preflight checks for E2E tests.
 * Call these at test start to fail fast with actionable errors instead of cryptic "element not found".
 */

import { expect, Page } from '@playwright/test';
import { E2E_SEED_SEARCH_TERM, E2E_SEED_MIN_FACTS } from './seed-contract';
import { tryText } from './dom';

export interface PreflightOptions {
  /** Minimum expected facts. Default: E2E_SEED_MIN_FACTS (4) */
  minFacts?: number;
  /** Search term that must return results. Default: E2E_SEED_SEARCH_TERM ("research") */
  searchTerm?: string;
  /** Skip search term verification. Use for tests that don't search. Default: false */
  skipSearchCheck?: boolean;
}

/**
 * Verify seed data is present and searchable BEFORE running test logic.
 * 
 * Converts "22 confusing failures" into "1 actionable failure":
 * "E2E seed loaded but does not contain search term 'research' → downstream specs will fail."
 * 
 * Usage:
 *   await gotoProject(page, seed.project_id);
 *   await preflightCheckSeedData(page); // Fail fast if seed is broken
 *   // ... rest of test logic
 */
export async function preflightCheckSeedData(
  page: Page,
  options: PreflightOptions = {}
): Promise<void> {
  const minFacts = options.minFacts ?? E2E_SEED_MIN_FACTS;
  const searchTerm = options.searchTerm ?? E2E_SEED_SEARCH_TERM;
  const skipSearchCheck = options.skipSearchCheck ?? false;

  // Wait for facts UI to mount (UI sentinel - works even if idle never becomes true)
  // Don't wait for idle - dev mode can have persistent background activity (HMR, etc.)
  await expect(page.getByTestId('facts-search-input')).toBeVisible({ timeout: 15000 });

  // Immediate diagnostics (no waiting) — prove whether testid contract exists
  const immediateCounts = {
    factCard: await page.locator('[data-testid="fact-card"]').count(),
    empty: await page.locator('[data-testid="facts-empty-state"]').count(),
    factsSearch: await page.locator('[data-testid="facts-search-input"]').count(),
    anyParagraphs: await page.locator('main p').count(),
  };
   
  console.log('[preflight] immediate dom counts', immediateCounts);
  const hasClimateText = await page.locator('text=/Climate research/i').first().isVisible().catch(() => false);
   
  console.log('[preflight] can see sample fact text=', hasClimateText);

  // Debug overlays (helps when something blocks pointer events)
  const overlayCounts = {
    dataStateOpen: await page.locator('[data-state="open"]').count(),
    roleDialog: await page.locator('[role="dialog"]').count(),
    radixPoppers: await page.locator('[data-radix-popper-content-wrapper]').count(),
  };
   
  console.log('[preflight] visible overlays', overlayCounts);

  // 1. Verify facts loaded (check debug strip if available — fully non-waiting)
  const debugLocator = page.locator('[data-testid="debug-facts-count"]');
  const debugFacts = (await debugLocator.count()) > 0 ? await debugLocator.textContent() : null;
  if (debugFacts) {
    const count = parseInt(debugFacts);
    if (count < minFacts) {
      throw new Error(
        `❌ PREFLIGHT FAILED: Expected >= ${minFacts} seeded facts, got ${count}.\n` +
        `   This test will fail downstream with "fact-card not found".\n` +
        `   Fix: Check seed endpoint or increase facts_count in seed fixture.`
      );
    }
  }

  // 2. Verify facts are visible (not just loaded, but rendered)
  // Use waitForFunction instead of expect()+Promise.race — reliable timeout, no hang on frame transitions
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
       
      console.log('[browser console error]', msg.text());
    }
  });
  page.on('pageerror', (err) => {
     
    console.log('[pageerror]', err.message);
  });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
       
      console.log('[nav]', frame.url());
    }
  });

   
  console.log('[preflight] url=', page.url());

  // 2. Verify facts/empty in DOM — use count (no visibility wait) when we already have cards
   
  console.log('[preflight] step=factCardOrEmpty start');
  if (immediateCounts.factCard > 0 || immediateCounts.empty > 0) {
    // Already have cards or empty state — skip wait, avoid overlay/visibility weirdness
  } else {
    try {
      await page.waitForFunction(
        (term: string) => {
          const isVisible = (el: Element | null) => {
            if (!el) return false;
            const s = getComputedStyle(el as HTMLElement);
            if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
            const r = (el as HTMLElement).getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          };
          const card = document.querySelector('[data-testid="fact-card"]');
          const empty = document.querySelector('[data-testid="facts-empty-state"]');
          if (isVisible(card) || isVisible(empty)) return true;
          const hasAnyFactText = Array.from(document.querySelectorAll('main p, [data-testid="facts-list"] p, [data-testid="facts-group-section"] p'))
            .some((p) => new RegExp(term, 'i').test(p.textContent || ''));
          return hasAnyFactText;
        },
        searchTerm,
        { timeout: 10_000 }
      );
    } catch (e) {
    if (page.isClosed()) {
      throw new Error(
        `❌ PREFLIGHT FAILED: page closed before facts/empty became visible.\n` +
        `   This usually means the test hit its timeout while waiting for initial render.\n` +
        `   Check: navigation loops, hydration stalls, or a hard crash in the page.`
      );
    }

    const cardCount = await page.evaluate(() => document.querySelectorAll('[data-testid="fact-card"]').length);
     
    console.log('[preflight] dom fact-card count=', cardCount);

    // Probe: what wrapper/testid do the visible row paragraphs have?
    const sample = await page.evaluate(() => {
      const listEl = document.querySelector('[data-testid="facts-list"]') ?? document.querySelector('[data-testid="facts-group-section"]');
      const paragraphs = listEl ? Array.from(listEl.querySelectorAll('p')) : Array.from(document.querySelectorAll('p')).filter((p) => (p.textContent || '').length > 30);
      const candidates = paragraphs.slice(0, 5).map((p) => ({
        text: (p.textContent || '').slice(0, 60),
        parentTestId: (p.closest('[data-testid]') as HTMLElement | null)?.dataset?.testid ?? null,
        parentTag: p.parentElement?.tagName ?? null,
        parentClass: (p.parentElement?.className || '').slice(0, 80),
      }));
      return { candidates };
    });
     
    console.log('[preflight] sample rows=', JSON.stringify(sample, null, 2));

    // Possible testid contract mismatch: facts rendered but fact-card missing
    const visibleFactText = await page.locator(`text=/${searchTerm}/i`).first().isVisible().catch(() => false);
    if (visibleFactText) {
      throw new Error(
        `❌ PREFLIGHT FAILED: Facts are visibly rendered, but data-testid="fact-card" is missing.\n` +
        `   UI shows fact text, but tests cannot find fact cards (dom count=${cardCount}).\n` +
        `   Fix: ensure each fact row/card root element has data-testid="fact-card" in All Data/Key Claims/Pinned renderers.`
      );
    }
    throw e;
    }
  }
   
  console.log('[preflight] step=factCardOrEmpty done');

  const hasCards = immediateCounts.factCard;
  if (hasCards === 0) {
    const visibleFactText = await page.locator(`text=/${searchTerm}/i`).first().isVisible().catch(() => false);
    if (visibleFactText) {
      throw new Error(
        `❌ PREFLIGHT FAILED: Facts visible by content, but data-testid="fact-card" is missing.\n` +
        `   Fix: add data-testid="fact-card" to the fact row root in All Data/Key Claims/Pinned renderers.`
      );
    }
    const emptyStateText = (await tryText(page.getByTestId('facts-empty-state'))) ?? 'Unknown';
    throw new Error(
      `❌ PREFLIGHT FAILED: No fact cards rendered (empty state: "${emptyStateText}").\n` +
      `   Possible causes:\n` +
      `   - Facts filtered out by default view/sort/search\n` +
      `   - Seed data doesn't match current filter state\n` +
      `   - View tab (Key Claims vs All Data) hiding facts`
    );
  }

  // 3. Verify search term returns results (core contract for many tests)
  if (!skipSearchCheck) {
     
    console.log('[preflight] step=search start');
    const searchInput = page.getByTestId('facts-search-input');
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await searchInput.fill(searchTerm);
    await page.waitForTimeout(500); // Allow search debounce

    const cardsAfterSearch = await page.getByTestId('fact-card').count();
    if (cardsAfterSearch === 0) {
      throw new Error(
        `❌ PREFLIGHT FAILED: Search for "${searchTerm}" returned 0 results.\n` +
        `   ALL seeded facts must contain "${searchTerm}" for E2E tests to work.\n` +
        `   Fix: Update test_helpers.py seed data to include "${searchTerm}" in fact_text.\n` +
        `   See: docs/solutions/E2E_TEST_FAILURES_SEED_DATA_MISMATCH.md`
      );
    }

    // Clear search for rest of test
    await searchInput.clear();
    await page.waitForTimeout(300);
     
    console.log('[preflight] step=search done');
  }
}

/**
 * Quick version: just verify facts exist, skip search check.
 * Use for tests that don't rely on search functionality.
 */
export async function preflightCheckFactsExist(page: Page, minFacts = 1): Promise<void> {
  await preflightCheckSeedData(page, { minFacts, skipSearchCheck: true });
}

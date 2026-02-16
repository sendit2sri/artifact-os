import { test, expect } from './fixtures/seed';
import { gotoProject } from './helpers/nav';

/**
 * Seed Contract Test - RUNS FIRST (alphabetically)
 * 
 * This test validates that the "kitchen sink" seed produces the expected data contract.
 * If this test fails, it means seed has regressed and 30+ other tests will fail mysteriously.
 * 
 * Purpose: Fail fast with clear diagnostics instead of cascading failures.
 * 
 * ⚠️ IMPORTANT: This file is named "seed-contract.spec.ts" (starts with "s") to run
 * early in alphabetical order. If you rename it, ensure it still runs early.
 */

test.describe('Seed Contract (Canary Test) @nightly', () => {
  test('seed contract: kitchen sink produces required invariants', async ({ page, seed }) => {
    // 1. Verify seed endpoint returned expected metadata
    expect(seed.project_id).toBeTruthy();
    expect(seed.source_id).toBeTruthy();
    
    // 2. Verify seed_verification object (server-side assertions)
    const verification = seed.seed_verification;
    expect(verification, 'seed_verification object missing').toBeTruthy();
    expect(verification.actual_facts, 'No facts created by seed').toBeGreaterThanOrEqual(8);
    expect(verification.expected_facts, 'Expected facts mismatch').toBeGreaterThanOrEqual(8);
    expect(verification.has_approved, 'Seed must have >= 2 approved facts').toBe(true);
    expect(verification.has_pinned, 'Seed must have >= 2 pinned facts').toBe(true);
    expect(verification.has_evidence, 'Seed must have evidence snippets').toBe(true);
    
    // 3. Verify known_fact_ids returned (for stable selectors)
    const knownIds = seed.known_fact_ids;
    expect(knownIds, 'known_fact_ids missing').toBeTruthy();
    expect(knownIds.approved_1, 'known_fact_ids.approved_1 missing').toBeTruthy();
    expect(knownIds.approved_2, 'known_fact_ids.approved_2 missing').toBeTruthy();
    expect(knownIds.pinned_1, 'known_fact_ids.pinned_1 missing').toBeTruthy();
    
    // 4. Verify UI reflects seed data
    await gotoProject(page, seed.project_id);
    
    // Check facts appear in UI
    const factCards = page.getByTestId('fact-card');
    await expect(factCards.first()).toBeVisible({ timeout: 15000 });
    const factCount = await factCards.count();
    expect(factCount, `UI shows ${factCount} facts, expected >= 8`).toBeGreaterThanOrEqual(8);
    
    // Check approved facts exist (look for anchor text)
    const approved1 = factCards.filter({ hasText: '[E2E:APPROVED-1]' });
    await expect(approved1).toBeVisible({ timeout: 5000 });
    
    const approved2 = factCards.filter({ hasText: '[E2E:APPROVED-2]' });
    await expect(approved2).toBeVisible({ timeout: 5000 });
    
    // Check pinned fact exists ([E2E:APPROVED-1] is pinned in kitchen sink)
    const approved1Card = factCards.filter({ hasText: '[E2E:APPROVED-1]' });
    await expect(approved1Card.locator('[data-testid="fact-pin-state"][data-pinned="true"]')).toHaveCount(1);
    
    // 5. Verify E2E mode is active
    const e2eBadge = page.getByTestId('e2e-mode-badge');
    await expect(e2eBadge).toBeVisible({ timeout: 3000 });
    
    // 6. Verify E2E controls are exposed
    const e2eControls = await page.evaluate(() => {
      return typeof (window as any).__e2e === 'object' && 
             typeof (window as any).__e2e.waitForIdle === 'function';
    });
    expect(e2eControls, 'window.__e2e controls not exposed').toBe(true);
    
    console.log('✅ Seed contract validated successfully');
  });
  
  test('seed contract: data-fact-id attributes exist', async ({ page, seed }) => {
    await gotoProject(page, seed.project_id);
    
    // Verify FactCard components have data-fact-id attribute
    const factCards = page.getByTestId('fact-card');
    await expect(factCards.first()).toBeVisible({ timeout: 15000 });
    
    const firstCard = factCards.first();
    const factId = await firstCard.getAttribute('data-fact-id');
    expect(factId, 'First fact card missing data-fact-id attribute').toBeTruthy();
    expect(factId?.length, 'data-fact-id should be UUID format').toBeGreaterThan(30);
    
    // Verify we can select by known ID (scope to fact-card to avoid evidence-open button)
    const approved1Card = page.locator(`[data-testid="fact-card"][data-fact-id="${seed.known_fact_ids.approved_1}"]`);
    await expect(approved1Card).toBeVisible({ timeout: 5000 });
    
    console.log('✅ data-fact-id selectors working');
  });
  
  test('seed contract: animations disabled in E2E mode', async ({ page }) => {
    // Navigate to project page to trigger providers
    await page.goto('/');
    
    // Verify animation-duration is 0 (from providers.tsx global CSS)
    const animationDisabled = await page.evaluate(() => {
      const testDiv = document.createElement('div');
      testDiv.style.transition = 'opacity 1s';
      document.body.appendChild(testDiv);
      const computed = window.getComputedStyle(testDiv);
      const transitionDuration = computed.transitionDuration;
      testDiv.remove();
      return transitionDuration === '0s';
    });
    
    expect(animationDisabled, 'Animations not disabled in E2E mode').toBe(true);
    console.log('✅ Animations disabled');
  });
});

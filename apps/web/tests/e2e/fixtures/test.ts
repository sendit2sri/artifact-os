/**
 * Auto fixtures for E2E tests.
 * Provides automatic test isolation with safe cleanup.
 * Extends fixtures/seed to provide seed + projectId for view-state-refactor and similar specs.
 */

import { test as base } from './seed';
import { setupCleanTestState } from '../helpers/setup';

/**
 * Enhanced test fixture with automatic cleanup before each test.
 *
 * Usage: import { test, expect } from './fixtures/test';
 *
 * Provides:
 * - seed (from fixtures/seed: project_id, source_id, facts_count, outputs_count)
 * - projectId (alias for seed.project_id)
 * - Auto storage clear (localStorage, sessionStorage, Cache API, Service Workers)
 * - Auto React Query cache clear
 * - Safe overlay dismissal (Escape + reload fallback, not DOM removal)
 * - Scroll reset
 * - Onboarding complete flag
 * - App idle wait
 */
export const test = base.extend<{
  projectId: string;
}>({
  page: async ({ page }, use) => {
    await setupCleanTestState(page);
    await use(page);
  },

  projectId: async ({ seed }, use) => {
    await use(seed.project_id);
  },
});

export { expect } from '@playwright/test';

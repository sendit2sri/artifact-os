/**
 * Reddit multi-source import E2E.
 * Seed Reddit demo (no external network); assert Reddit badge, facts, evidence permalink.
 * Run with ARTIFACT_ENABLE_TEST_SEED=true and NEXT_PUBLIC_ENABLE_TEST_SEED=true.
 * npx playwright test reddit-import.spec.ts
 */

import { test, expect } from '@playwright/test';
import { switchToAllDataView } from './helpers/nav';
import { openEvidenceForFirstFact } from './helpers/evidence';

const WORKSPACE_ID = '123e4567-e89b-12d3-a456-426614174000';

async function createEmptyProject(request: { post: (url: string, opts: { data: unknown }) => Promise<{ ok: () => boolean; json: () => Promise<{ id: string }> }> }): Promise<string> {
  const res = await request.post('/api/v1/projects', {
    data: { workspace_id: WORKSPACE_ID, title: 'Reddit Import E2E Project' },
  });
  if (!res.ok()) throw new Error('Create project failed');
  const data = await res.json();
  return data.id;
}

test.describe('Reddit import', () => {
  test.beforeEach(async ({ page, request }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('artifact_onboarding_completed_v1', 'true'));
    const projectId = await createEmptyProject(request);
    await page.goto(`/project/${projectId}`);
  });

  test('seed Reddit demo → at least 6 facts, Reddit badge, evidence permalink', async ({ page, request }) => {
    const projectId = await page.evaluate(() => {
      const m = window.location.pathname.match(/\/project\/([^/]+)/);
      return m ? m[1] : null;
    });
    if (!projectId) throw new Error('No project ID in URL');

    await expect(page.getByTestId('quickstart-paste-url').or(page.getByTestId('fact-card').first())).toBeVisible({ timeout: 15_000 });

    const quickstartReddit = page.getByTestId('quickstart-demo-reddit');
    if (await quickstartReddit.isVisible()) {
      await quickstartReddit.click();
    } else {
      const res = await request.post('/api/v1/test/seed_sources', {
        data: { project_id: projectId, reset: true, sources: ['reddit'] },
      });
      if (!res.ok()) {
        test.skip(true, 'seed_sources disabled (ARTIFACT_ENABLE_TEST_SEED)');
        return;
      }
      await page.reload();
      await page.waitForLoadState('networkidle').catch(() => {});
      await switchToAllDataView(page);
    }

    await expect(async () => {
      const cards = page.getByTestId('fact-card');
      await expect(cards.first()).toBeVisible({ timeout: 10_000 });
      const count = await cards.count();
      expect(count).toBeGreaterThanOrEqual(6);
    }).toPass({ timeout: 20_000 });

    await expect(page.locator('[data-testid="source-type-badge"][data-source-type="REDDIT"]').first()).toBeVisible({ timeout: 5000 });

    // Use robust evidence panel helper (handles scroll + async loading)
    await openEvidenceForFirstFact(page);
    
    await expect(page.getByTestId('evidence-open-primary')).toBeVisible({ timeout: 3000 });
    const sourceUrl = page.getByTestId('evidence-source-url');
    await expect(sourceUrl).toBeVisible({ timeout: 3000 });
    await expect(sourceUrl).toHaveAttribute('href', /\/comments\//);
  });
});

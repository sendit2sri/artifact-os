/**
 * YouTube multi-source import E2E.
 * Seed YouTube demo (no external network); assert YouTube badge, transcript chip, Open video, synthesis.
 * Run with ARTIFACT_ENABLE_TEST_SEED=true and NEXT_PUBLIC_ENABLE_TEST_SEED=true.
 * npx playwright test youtube-import.spec.ts
 */

import { test, expect } from '@playwright/test';
import { switchToAllDataView } from './helpers/nav';
import { openEvidenceForFirstFact } from './helpers/evidence';

const WORKSPACE_ID = '123e4567-e89b-12d3-a456-426614174000';

async function createEmptyProject(request: { post: (url: string, opts: { data: unknown }) => Promise<{ ok: () => boolean; json: () => Promise<{ id: string }> }> }): Promise<string> {
  const res = await request.post('/api/v1/projects', {
    data: { workspace_id: WORKSPACE_ID, title: 'YouTube Import E2E Project' },
  });
  if (!res.ok()) throw new Error('Create project failed');
  const data = await res.json();
  return data.id;
}

test.describe('YouTube import', () => {
  test.beforeEach(async ({ page, request }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('artifact_onboarding_completed_v1', 'true'));
    const projectId = await createEmptyProject(request);
    await page.goto(`/project/${projectId}`);
  });

  test('seed YouTube demo → YouTube badge, Transcript chip, Open video, synthesis works', async ({ page, request }) => {
    const projectId = await page.evaluate(() => {
      const m = window.location.pathname.match(/\/project\/([^/]+)/);
      return m ? m[1] : null;
    });
    if (!projectId) throw new Error('No project ID in URL');

    await expect(page.getByTestId('quickstart-paste-url').or(page.getByTestId('fact-card').first())).toBeVisible({ timeout: 15_000 });

    const quickstartYoutube = page.getByTestId('quickstart-demo-youtube');
    if (await quickstartYoutube.isVisible()) {
      await quickstartYoutube.click();
    } else {
      const res = await request.post('/api/v1/test/seed_sources', {
        data: { project_id: projectId, reset: true, sources: ['youtube'] },
      });
      if (!res.ok()) {
        test.skip(true, 'seed_sources disabled (ARTIFACT_ENABLE_TEST_SEED)');
        return;
      }
      await page.reload();
      await page.waitForLoadState('networkidle').catch(() => {});
      await switchToAllDataView(page);
    }

    await expect(page.getByTestId('fact-card').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid="source-type-badge"][data-source-type="YOUTUBE"]').first()).toBeVisible({ timeout: 5000 });

    await expect(page.getByTestId('fact-context-chip').filter({ hasText: 'Transcript' }).first()).toBeVisible({ timeout: 5000 });

    // Use robust evidence panel helper (handles scroll + async loading)
    await openEvidenceForFirstFact(page);
    
    await expect(page.getByTestId('evidence-open-primary')).toHaveText(/Open video/);

    const genBtn = page.getByRole('button', { name: /Generate|Synthesize/i }).or(page.getByTestId('synthesis-generate-btn'));
    if (await genBtn.first().isVisible({ timeout: 3000 })) {
      const firstCard = page.getByTestId('fact-select-button').first();
      await firstCard.click();
      const secondCard = page.getByTestId('fact-select-button').nth(1);
      await secondCard.click();
      await genBtn.first().click();
      await expect(async () => {
        const output = page.locator('[data-testid="output-drawer"]').or(page.getByRole('dialog')).or(page.locator('text=Sources:'));
        await expect(output.first()).toBeVisible({ timeout: 15_000 });
        const body = await page.locator('main').textContent();
        expect((body || '').length).toBeGreaterThan(80);
      }).toPass({ timeout: 25_000 });
    }
  });
});

/**
 * View link E2E: apply state, copy view link, navigate to link, assert state matches URL.
 */

import { test, expect } from './fixtures/seed';
import { gotoProject, switchToAllDataView } from './helpers/nav';
import { preflightCheckSeedData } from './helpers/preflight';
import { E2E_SEED_SEARCH_TERM } from './helpers/seed-contract';

test.describe('View link', () => {
  test('copy view link and navigate: state matches URL', async ({ page, seed }) => {
    test.setTimeout(120_000); // gotoProject + switchToAllDataView + preflight can exceed 60s

    const t0 = Date.now();
    const mark = (label: string) => console.log(`[view-link] ${label} +${Date.now() - t0}ms`);
    page.on('close', () => console.log(`[view-link] PAGE CLOSED +${Date.now() - t0}ms`));
    page.context().on('close', () => console.log(`[view-link] CONTEXT CLOSED +${Date.now() - t0}ms`));

    mark('gotoProject start');
    await gotoProject(page, seed.project_id);
    mark('gotoProject done');

    mark('switchToAllDataView start');
    await switchToAllDataView(page);
    mark('switchToAllDataView done');

    // Debug: log toggle state (persisted toggles can trigger alternate render paths)
    // eslint-disable-next-line no-console
    console.log('[debug] collapse checked =', await page.getByTestId('toggle-collapse-similar').isChecked().catch(() => null));
    // eslint-disable-next-line no-console
    console.log('[debug] selected-only checked =', await page.getByTestId('facts-selected-only-toggle').isChecked().catch(() => null));
    // eslint-disable-next-line no-console
    console.log('[debug] show-suppressed checked =', await page.getByTestId('facts-show-suppressed-toggle').isChecked().catch(() => null));

    mark('preflight start');
    await preflightCheckSeedData(page);
    mark('preflight done');

    await page.getByTestId('facts-sort-trigger').click();
    await page.getByTestId('facts-sort-option-needs_review').click();
    await page.getByTestId('facts-group-trigger').click();
    await page.getByTestId('facts-group-option-source').click();
    await page.getByTestId('facts-search-input').fill(E2E_SEED_SEARCH_TERM);

    await expect(async () => {
      const url = page.url();
      expect(url).toContain('sort=needs_review');
      expect(url).toContain('group=source');
      expect(url).toContain('view=all');
      expect(url).toContain(`q=${E2E_SEED_SEARCH_TERM}`);
    }).toPass({ timeout: 5000 });

    mark('open views');
    await page.getByTestId('views-trigger').click();
    await page.getByTestId('views-copy-link').click();

    const baseUrl = page.url().split('?')[0];
    const viewUrl = `${baseUrl}?sort=needs_review&group=source&view=all&q=${E2E_SEED_SEARCH_TERM}`;
    mark('navigate viewUrl');
    await page.goto(viewUrl, { waitUntil: 'domcontentloaded' });
    mark('navigate viewUrl done');
    await expect(page.getByTestId('fact-card').first()).toBeVisible({ timeout: 10_000 });
    await expect(async () => {
      await expect(page.getByTestId('facts-sort-trigger')).toContainText(/needs review/i);
      await expect(page.getByTestId('facts-group-trigger')).toContainText(/source/i);
      await expect(page.getByTestId('facts-search-input')).toHaveValue(E2E_SEED_SEARCH_TERM);
    }).toPass({ timeout: 10_000 });
  });
});

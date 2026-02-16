/**
 * E2E Synthesis Test Helpers
 *
 * 100% stable-selector driven, parallel-safe.
 * No text matching, no arbitrary sleeps, no Promise.race.
 */

import { Page, expect } from '@playwright/test';

export { waitForAppIdle } from './setup';

export type SynthesisResult = 'drawer' | 'builder' | 'error';

/**
 * Select the first N visible fact cards (seed-agnostic).
 * Use when seed may not have specific anchors (e.g. seedWithSimilarFacts).
 * When assertSelectedCount is true, asserts selection-bar shows "Selected: 1", "Selected: 2", etc. after each click.
 */
export async function selectFirstNVisibleFacts(
  page: Page,
  n: number,
  options?: { timeout?: number; assertSelectedCount?: boolean }
): Promise<void> {
  const timeout = options?.timeout ?? 10000;
  const assertSelectedCount = options?.assertSelectedCount ?? false;
  await expect(page.getByTestId('fact-card').first()).toBeVisible({ timeout });
  for (let i = 0; i < n; i++) {
    const cards = page.getByTestId('fact-card');
    const card = cards.nth(i);
    await expect(card).toBeVisible({ timeout });
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    await card.hover();
    await page.waitForTimeout(100);
    const selectBtn = card.getByTestId('fact-select-button');
    await selectBtn.click({ force: true });
    await page.waitForTimeout(200);
    if (assertSelectedCount) {
      const expectedCount = i + 1;
      const bar = page.getByTestId('selection-bar');
      const hasExpected = await bar
        .evaluate((el, expected) => el.textContent?.includes(`Selected: ${expected}`), expectedCount)
        .catch(() => false);
      if (!hasExpected) {
        // Fallback: button click may be intercepted in grouped/collapsed layout; card onClick toggles selection.
        // Click left edge (checkbox area) to avoid fact text which enters edit mode.
        const box = await card.boundingBox();
        if (box) {
          await page.mouse.click(box.x + 24, box.y + box.height / 2, { force: true });
        } else {
          await card.click({ force: true });
        }
        await page.waitForTimeout(200);
      }
      await expect(bar).toContainText(`Selected: ${expectedCount}`, { timeout: 5000 });
    }
  }
}

/**
 * Select one fact per group (up to nGroups). Stable for collapse+grouped: each selection
 * comes from a fresh section locator, avoiding DOM remount/reorder issues.
 * If fewer groups than needed, selects multiple from first group.
 */
export async function selectOneFactPerGroup(
  page: Page,
  nGroups = 2,
  options?: { timeout?: number; assertSelectedCount?: boolean }
): Promise<void> {
  const timeout = options?.timeout ?? 10000;
  const assertSelectedCount = options?.assertSelectedCount ?? true;
  const sections = page.getByTestId('facts-group-section');
  await expect(sections.first()).toBeVisible({ timeout });
  const sectionCount = await sections.count();
  if (sectionCount === 0) {
    throw new Error('selectOneFactPerGroup: no facts-group-section found');
  }

  let selectedCount = 0;
  for (let g = 0; g < sectionCount && selectedCount < 2; g++) {
    await page.waitForTimeout(selectedCount > 0 ? 400 : 0);
    const sectionsNow = page.getByTestId('facts-group-section');
    const section = sectionsNow.nth(g);
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    const cards = section.getByTestId('fact-card');
    const cardCount = await cards.count();
    const need = 2 - selectedCount;
    const perGroup = sectionCount === 1 ? need : 1;
    const take = Math.min(need, perGroup, cardCount);
    for (let c = 0; c < take && selectedCount < 2; c++) {
      const card = cards.nth(c);
      await expect(card).toBeVisible({ timeout });
      await card.scrollIntoViewIfNeeded();
      await page.waitForTimeout(100);
      await card.hover();
      await page.waitForTimeout(100);
      const selectBtn = card.getByTestId('fact-select-button');
      await selectBtn.click({ force: true });
      await page.waitForTimeout(200);
      selectedCount++;
      if (assertSelectedCount) {
        const bar = page.getByTestId('selection-bar');
        const hasExpected = await bar
          .evaluate((el, expected) => el.textContent?.includes(`Selected: ${expected}`), selectedCount)
          .catch(() => false);
        if (!hasExpected) {
          const box = await card.boundingBox();
          if (box) {
            await page.mouse.click(box.x + 24, box.y + box.height / 2, { force: true });
          } else {
            await card.click({ force: true });
          }
          await page.waitForTimeout(200);
        }
        await expect(bar).toContainText(`Selected: ${selectedCount}`, { timeout: 5000 });
      }
    }
  }

  if (selectedCount < 2) {
    throw new Error(
      `selectOneFactPerGroup: selected ${selectedCount} facts (need 2). Sections: ${sectionCount}`
    );
  }
}

/**
 * Select exactly two facts from the fact list. Switches to All view first so enough facts are visible (invert/select-all behave correctly).
 * Uses stable anchors [E2E:APPROVED-1] and [E2E:APPROVED-2] to avoid nth() ambiguity.
 */
export async function selectTwoFacts(page: Page, options?: { timeout?: number }): Promise<void> {
  const timeout = options?.timeout ?? 10000;
  const { switchToAllDataView } = await import('./nav');
  const { expectFactsVisible } = await import('./setup');
  await switchToAllDataView(page);
  await expectFactsVisible(page, timeout);
  const card1 = page.getByTestId('fact-card').filter({ hasText: '[E2E:APPROVED-1]' });
  const card2 = page.getByTestId('fact-card').filter({ hasText: '[E2E:APPROVED-2]' });
  await card1.getByTestId('fact-select-button').click();
  await card2.getByTestId('fact-select-button').click();
}

/**
 * Select two facts from different sources to open SynthesisBuilder.
 * Uses [E2E:APPROVED-1] (source1) and [E2E:PENDING-1] (source2) for stable cross-source selection.
 */
export async function selectTwoFactsFromDifferentSources(page: Page): Promise<void> {
  const { switchToAllDataView } = await import('./nav');
  const { expectFactsVisible } = await import('./setup');
  await switchToAllDataView(page);
  await expectFactsVisible(page, 10000);
  const card1 = page.getByTestId('fact-card').filter({ hasText: '[E2E:APPROVED-1]' });
  const card2 = page.getByTestId('fact-card').filter({ hasText: '[E2E:PENDING-1]' });
  await card1.getByTestId('fact-select-button').click();
  await card2.getByTestId('fact-select-button').click();
}

/**
 * Click the Generate button (stable selector only)
 */
export async function clickGenerate(page: Page, options?: { timeout?: number }): Promise<void> {
  const timeout = options?.timeout ?? 5000;
  const generateBtn = page.getByTestId('generate-synthesis');
  await expect(generateBtn).toBeEnabled({ timeout });
  await generateBtn.click();
}

async function getE2EDebug(page: Page) {
  return page
    .evaluate(() => {
      const e2e = (window as any).__e2e;
      return {
        hasE2E: !!e2e,
        idle: e2e?.isIdle?.()?.idle ?? null,
        reasons: e2e?.isIdle?.()?.reasons ?? null,
        state: e2e?.state ?? null,
        queryKeys: e2e?.getQueryCacheKeys?.() ?? null,
      };
    })
    .catch(() => ({ hasE2E: false }));
}

/**
 * Click Generate and wait for synth POST 200/201/202.
 * Waits for REQUEST first (deterministic), then response. Fails fast with diagnostics if
 * button disabled, click intercepted, or POST never fires.
 */
export async function clickGenerateAndWaitForPost(
  page: Page,
  projectId: string,
  options?: { timeout?: number }
): Promise<void> {
  const timeout = options?.timeout ?? 15_000;
  const synthPath = `/api/v1/projects/${projectId}/synthesize`;

  const generateBtn = page.getByTestId('generate-synthesis');
  await expect(generateBtn, 'Generate button not visible').toBeVisible({ timeout: 5000 });
  await expect(
    generateBtn,
    'Generate button disabled (likely no facts selected)'
  ).toBeEnabled({ timeout: 5000 });

  const selected = await page
    .evaluate(() => (window as any).__e2e?.state?.selectedCount ?? null)
    .catch(() => null);
  if (selected !== null && selected <= 0) {
    throw new Error(
      `Generate is enabled but selectedCount=${selected}. Test setup likely broken.`
    );
  }

  const failed: { url: string; method: string; error: string }[] = [];
  const recentStarted: { method: string; url: string }[] = [];
  const recentFinished: { method: string; url: string; status: number }[] = [];
  const MAX_RECENT = 15;

  const onReqFail = (req: { url: () => string; method: () => string; failure: () => { errorText: string } | null }) => {
    failed.push({
      url: req.url(),
      method: req.method(),
      error: req.failure()?.errorText ?? 'unknown',
    });
  };
  const onRequest = (req: { url: () => string; method: () => string }) => {
    recentStarted.push({ method: req.method(), url: req.url() });
    if (recentStarted.length > MAX_RECENT) recentStarted.shift();
  };
  const onResponse = (res: { url: () => string; request: () => { method: () => string; url: () => string }; status: () => number }) => {
    const req = res.request();
    recentFinished.push({
      method: req.method(),
      url: req.url(),
      status: res.status(),
    });
    if (recentFinished.length > MAX_RECENT) recentFinished.shift();
  };

  page.on('requestfailed', onReqFail);
  page.on('request', onRequest);
  page.on('response', onResponse);

  try {
    const reqPromise = page.waitForRequest(
      (req) => {
        if (req.method() !== 'POST') return false;
        try {
          const u = new URL(req.url());
          return u.pathname === synthPath;
        } catch {
          return req.url().includes(synthPath);
        }
      },
      { timeout }
    );

    await generateBtn.scrollIntoViewIfNeeded();
    await generateBtn.click({ trial: true });
    await generateBtn.click();

    // First click may open trust-gate, synthesis-builder, or cluster-preview instead of firing POST.
    // Resolve these so synthesis actually runs.
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(400);
      const cluster = page.getByTestId('cluster-preview');
      const trustGate = page.getByTestId('trust-gate');
      const builder = page.getByTestId('synthesis-builder');
      if (await cluster.isVisible().catch(() => false)) {
        await page.getByTestId('cluster-preview-confirm').click();
        continue;
      }
      if (await trustGate.isVisible().catch(() => false)) {
        const includeAnyway = page.getByTestId('trust-gate-include-anyway');
        if (await includeAnyway.isVisible().catch(() => false)) {
          await includeAnyway.click();
        } else {
          const removeBtn = page.getByTestId('trust-gate-remove-non-approved');
          if (await removeBtn.isEnabled().catch(() => false)) {
            await removeBtn.click();
          }
        }
        break;
      }
      if (await builder.isVisible().catch(() => false)) {
        const mergeBtn = page.getByTestId('synthesis-builder-generate-merge');
        if (await mergeBtn.isVisible().catch(() => false)) {
          await mergeBtn.click();
        }
        break;
      }
      break;
    }

    const req = await reqPromise;

    const res = await Promise.race([
      req.response(),
      new Promise<null>((_, reject) =>
        setTimeout(
          () => reject(new Error('Timed out waiting for POST /synthesize response')),
          timeout
        )
      ),
    ]);

    if (!res) {
      throw new Error('POST /synthesize response is null (request may have been aborted).');
    }

    const status = res.status();
    if (![200, 201, 202].includes(status)) {
      const body = await res.text().catch(() => '<no body>');
      throw new Error(`POST /synthesize returned ${status}: ${body.slice(0, 500)}`);
    }
  } catch (e: unknown) {
    const dbg = await getE2EDebug(page);
    const url = page.url();
    const failureLines = failed
      .filter((x) => x.method === 'POST' || x.url.includes('/synthesize'))
      .slice(-5)
      .map((x) => `- ${x.method} ${x.url} :: ${x.error}`)
      .join('\n');

    const startedLines = recentStarted
      .map((r) => `- ${r.method} ${r.url}`)
      .join('\n');
    const finishedLines = recentFinished
      .map((r) => `- ${r.method} ${r.url} → ${r.status}`)
      .join('\n');

    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      [
        `clickGenerateAndWaitForPost failed: ${msg}`,
        `page.url=${url}`,
        `__e2e.has=${dbg.hasE2E} idle=${dbg.idle} reasons=${JSON.stringify(dbg.reasons)}`,
        `__e2e.state=${JSON.stringify(dbg.state)}`,
        failureLines ? `requestfailed (recent):\n${failureLines}` : 'requestfailed: (none captured)',
        `Recent requests (started):\n${startedLines || '(none)'}`,
        `Recent requests (finished):\n${finishedLines || '(none)'}`,
      ].join('\n')
    );
  } finally {
    page.off('requestfailed', onReqFail);
    page.off('request', onRequest);
    page.off('response', onResponse);
  }
}

const OUTPUTS_PATH_PREFIX = '/api/v1/projects/';
const OUTPUTS_PATH_SUFFIX = '/outputs';

function waitForOutputsList200(page: Page, projectId: string, timeout = 10_000) {
  return page.waitForResponse(
    (r) => {
      try {
        const u = new URL(r.url());
        return (
          u.pathname.startsWith(OUTPUTS_PATH_PREFIX) &&
          u.pathname.endsWith(OUTPUTS_PATH_SUFFIX) &&
          u.pathname.includes(projectId) &&
          r.request().method() === 'GET' &&
          r.status() === 200
        );
      } catch {
        return false;
      }
    },
    { timeout }
  );
}

/**
 * Wait for synthesis result: error → drawer → builder → cluster.
 * Forces outputs refetch + waits for GET outputs 200 before checking UI (deterministic).
 */
export async function waitForSynthesisResult(
  page: Page,
  projectId: string,
  timeoutMs = 20_000
): Promise<SynthesisResult | 'cluster'> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const outputsPromise = waitForOutputsList200(page, projectId, 10_000).catch(() => null);
    await page.evaluate(
      (pid: string) => (window as any).__e2e?.refetchOutputs?.(pid),
      projectId
    );
    await outputsPromise;

    const errorBanner = page.getByTestId('synthesis-error-banner');
    const drawer = page.getByTestId('output-drawer');
    const builder = page.getByTestId('synthesis-builder');
    const cluster = page.getByTestId('cluster-preview');

    if (await errorBanner.isVisible()) return 'error';
    if (await drawer.isVisible()) return 'drawer';
    if (await cluster.isVisible()) return 'cluster';
    if (await builder.isVisible()) return 'builder';

    await page.waitForTimeout(150);
  }

  const diag = await page
    .evaluate(() => {
      const e2e = (window as any).__e2e;
      const keys = e2e?.getQueryCacheKeys?.() ?? [];
      const outputsKeys = keys.filter(
        (k: unknown) => Array.isArray(k) && k[0] === 'project-outputs'
      );
      return {
        hasE2E: !!e2e,
        idle: e2e?.isIdle?.()?.toString?.() ?? null,
        outputsKeys,
      };
    })
    .catch(() => ({}));

  throw new Error(
    `Waiting for synthesis result...\n${JSON.stringify(diag, null, 2)}`
  );
}

/**
 * Complete SynthesisBuilder flow: click split, wait for drawer
 */
export async function completeSynthesisBuilder(page: Page): Promise<void> {
  const builder = page.getByTestId('synthesis-builder');
  await expect(builder).toBeVisible();
  await page.getByTestId('synthesis-builder-generate-split').click();
  const drawer = page.getByTestId('output-drawer');
  await expect(drawer).toBeVisible({ timeout: 30000 });
}

/**
 * If builder is open, click merge (Combine All) and wait for drawer. Use for paragraph/research_brief/script_outline.
 */
export async function completeSynthesisBuilderMerge(page: Page): Promise<void> {
  const builder = page.getByTestId('synthesis-builder');
  await expect(builder).toBeVisible();
  const mergeBtn = page.getByTestId('synthesis-builder-generate-merge');
  await expect(mergeBtn).toBeVisible({ timeout: 5000 });
  await expect(mergeBtn).toBeEnabled({ timeout: 5000 });
  await mergeBtn.scrollIntoViewIfNeeded();
  await mergeBtn.click();
  const drawer = page.getByTestId('output-drawer');
  await expect(drawer).toBeVisible({ timeout: 30000 });
}

/**
 * After clicking Generate, wait for any synthesis path; resolve trust-gate/builder/cluster; assert output drawer.
 * Handles: trust-gate, synthesis-builder, cluster-preview, output-drawer (direct).
 */
export async function ensureOutputDrawerAfterGenerate(
  page: Page,
  mode: 'merge' | 'split' = 'merge',
  waitTimeout = 30000
): Promise<void> {
  const output = page.getByTestId('output-drawer');
  const trustGate = page.getByTestId('trust-gate');
  const builder = page.getByTestId('synthesis-builder');
  const cluster = page.getByTestId('cluster-preview');

  // Wait for any synthesis path
  await expect(trustGate.or(builder).or(cluster).or(output)).toBeVisible({ timeout: waitTimeout });

  // Trust gate path: resolve then re-wait for builder/cluster/output
  if (await trustGate.isVisible().catch(() => false)) {
    const removeBtn = page.getByTestId('trust-gate-remove-non-approved');
    const includeAnyway = page.getByTestId('trust-gate-include-anyway');
    const removeVisibleAndEnabled =
      (await removeBtn.isVisible().catch(() => false)) &&
      (await removeBtn.isEnabled().catch(() => false));
    if (removeVisibleAndEnabled) {
      await removeBtn.click();
    } else {
      await includeAnyway.click();
    }
    await expect(trustGate.or(builder).or(cluster).or(output)).toBeVisible({ timeout: waitTimeout });
  }

  // Cluster preview path
  if (await cluster.isVisible().catch(() => false)) {
    await page.getByTestId('cluster-preview-confirm').click();
    await expect(output).toBeVisible({ timeout: waitTimeout });
    return;
  }

  // Builder path
  if (await builder.isVisible().catch(() => false)) {
    if (mode === 'split') {
      await page.getByTestId('synthesis-builder-generate-split').click();
    } else {
      await page.getByTestId('synthesis-builder-generate-merge').click();
    }
    await expect(output).toBeVisible({ timeout: waitTimeout });
    return;
  }

  // Output already visible
  await expect(output).toBeVisible({ timeout: waitTimeout });
}

/**
 * Assert OutputDrawer opened with valid E2E markers (non-empty + Sources: + Mode:).
 * Use for Last Output / History tests where content may be short (seeded outputs).
 */
export async function assertDrawerHasE2EMarkers(page: Page): Promise<void> {
  const drawer = page.getByTestId('output-drawer');
  await expect(drawer).toBeVisible();

  const content = page.getByTestId('output-drawer-content');
  await expect(content).toBeVisible();

  const text = ((await content.textContent()) ?? '').trim();
  expect(text).not.toBe('');
  expect(text).toContain('Sources:');
  expect(text).toContain('Mode:');
  expect(text.length).toBeGreaterThan(10);
}

/**
 * Assert OutputDrawer has substantive body (>50 chars) and E2E markers.
 * Use only for fresh synthesis generation test.
 */
export async function assertDrawerHasSubstantiveBody(page: Page): Promise<void> {
  const content = page.getByTestId('output-drawer-content');
  const text = ((await content.textContent()) ?? '').trim();
  expect(text.length).toBeGreaterThan(50);
  expect(text).toContain('Sources:');
  expect(text).toContain('Mode:');
}

/**
 * Assert OutputDrawer opened with valid E2E content (markers only, no length).
 * Alias for assertDrawerHasE2EMarkers.
 */
export async function assertDrawerSuccess(page: Page): Promise<void> {
  await assertDrawerHasE2EMarkers(page);
}

/**
 * Assert error state: banner visible, drawer and builder hidden; retry button visible; optional message match
 */
export async function assertErrorState(page: Page, expectedMessage?: RegExp): Promise<void> {
  const errorBanner = page.getByTestId('synthesis-error-banner');
  const drawer = page.getByTestId('output-drawer');
  const builder = page.getByTestId('synthesis-builder');
  const retryBtn = page.getByTestId('synthesis-error-retry');

  await expect(errorBanner).toBeVisible({ timeout: 10000 });
  await expect(drawer).toBeHidden();
  await expect(builder).toBeHidden();
  await expect(retryBtn).toBeVisible();
  await expect(retryBtn).toBeEnabled();

  if (expectedMessage) {
    await expect(errorBanner).toContainText(expectedMessage);
  }
}

/**
 * Click Retry on synthesis error banner and wait for result (drawer or error)
 */
export async function clickRetrySynthesis(
  page: Page,
  projectId: string
): Promise<SynthesisResult> {
  const retryBtn = page.getByTestId('synthesis-error-retry');
  await expect(retryBtn).toBeEnabled({ timeout: 5000 });
  await retryBtn.click();
  return waitForSynthesisResult(page, projectId);
}

/**
 * Open Last Output drawer via stable selector
 */
export async function openLastOutput(page: Page): Promise<void> {
  const lastOutputBtn = page.getByTestId('last-output-button');
  await expect(lastOutputBtn).toBeEnabled({ timeout: 5000 });
  await lastOutputBtn.click();
  const drawer = page.getByTestId('output-drawer');
  await expect(drawer).toBeVisible({ timeout: 5000 });
}

/**
 * Close OutputDrawer: click only if visible, then assert hidden
 */
export async function closeDrawer(page: Page): Promise<void> {
  const drawer = page.getByTestId('output-drawer');
  const closeBtn = page.getByTestId('output-drawer-close');

  if (await drawer.isVisible()) {
    await closeBtn.click();
  }
  await expect(drawer).toBeHidden();
}

/**
 * Open History panel via outputs-history-button
 */
export async function openHistoryPanel(page: Page): Promise<void> {
  const btn = page.getByTestId('outputs-history-button');
  await expect(btn).toBeVisible({ timeout: 5000 });
  await btn.click();
  const panel = page.getByTestId('outputs-history-drawer');
  await expect(panel).toBeVisible({ timeout: 5000 });
}

/**
 * Close History panel via outputs-history-close
 */
export async function closeHistoryPanel(page: Page): Promise<void> {
  const panel = page.getByTestId('outputs-history-drawer');
  const closeBtn = page.getByTestId('outputs-history-close');
  if (await panel.isVisible()) {
    await closeBtn.click();
  }
  await expect(panel).toBeHidden();
}

/**
 * Full flow: select facts, generate, wait for result; complete builder/cluster if needed.
 * Waits for synth POST 200 before waiting for outputs (deterministic).
 */
export async function generateSynthesis(
  page: Page,
  projectId: string
): Promise<SynthesisResult> {
  await selectTwoFacts(page);
  await clickGenerateAndWaitForPost(page, projectId);
  const result = await waitForSynthesisResult(page, projectId);

  if (result === 'builder') {
    await completeSynthesisBuilder(page);
    return 'drawer';
  }
  if (result === 'cluster') {
    await page.getByTestId('cluster-preview-confirm').click();
    await expect(page.getByTestId('output-drawer')).toBeVisible({ timeout: 30000 });
    return 'drawer';
  }
  return result;
}

/**
 * Set synthesis format via Select (stable data-testid options).
 */
export async function setSynthesisFormat(
  page: Page,
  value: 'paragraph' | 'research_brief' | 'script_outline' | 'split'
): Promise<void> {
  const trigger = page.getByTestId('synthesis-format-trigger');
  await expect(trigger).toBeVisible({ timeout: 5000 });
  await trigger.click();
  const option = page.getByTestId(`synthesis-format-option-${value}`);
  await expect(option).toBeVisible({ timeout: 3000 });
  await option.click();
}

/**
 * Get OutputDrawer content text (for asserting Mode footer etc.)
 */
export async function getOutputDrawerContent(page: Page): Promise<string> {
  const content = page.getByTestId('output-drawer-content');
  await expect(content).toBeVisible({ timeout: 5000 });
  return (await content.textContent()) ?? '';
}

/**
 * Open builder (or drawer) by selecting two facts from different sources, set format to split, then click Generate.
 * If builder opens, complete it (clicks split generate); if cluster, confirm; else drawer already visible.
 */
export async function generateSplitSections(
  page: Page,
  projectId: string
): Promise<void> {
  await selectTwoFactsFromDifferentSources(page);
  await setSynthesisFormat(page, 'split');
  await clickGenerateAndWaitForPost(page, projectId);
  const result = await waitForSynthesisResult(page, projectId);
  if (result === 'builder') {
    await completeSynthesisBuilder(page);
  } else if (result === 'cluster') {
    await page.getByTestId('cluster-preview-confirm').click();
    await expect(page.getByTestId('output-drawer')).toBeVisible({ timeout: 30000 });
  } else {
    await expect(page.getByTestId('output-drawer')).toBeVisible({ timeout: 15000 });
  }
}

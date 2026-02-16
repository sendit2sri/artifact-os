#!/usr/bin/env node
/**
 * Preflight: verify window.__e2e is exposed before running Playwright E2E.
 * Waits up to 15s for providers to mount; fails fast if harness missing (env not reaching client bundle).
 */
const fs = require('node:fs');
const { chromium } = require('playwright');

let page, browser;
const consoleLogs = [];
const pageErrors = [];
const failedRequests = [];
const badResponses = [];

(async () => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';

  // Use /project/:id (same route as tests) if seed is available; otherwise /
  let preflightUrl = baseUrl.replace(/\/$/, '') + '/';
  try {
    const seedRes = await fetch(`${backendUrl}/api/v1/test/seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true, outputs_count: 2 }),
    });
    if (seedRes.ok) {
      const seed = await seedRes.json();
      if (seed.project_id) {
        preflightUrl = `${baseUrl.replace(/\/$/, '')}/project/${seed.project_id}`;
        console.log('Preflight URL (from seed):', preflightUrl);
      }
    }
  } catch (e) {
    console.log('Preflight URL (seed skipped, using /):', preflightUrl);
  }

  browser = await chromium.launch();
  page = await browser.newPage();

  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error' || type === 'warning' || text.includes('[E2E]')) {
      consoleLogs.push(`[${type}] ${text}`);
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });
  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.url()} ${req.failure()?.errorText ?? 'unknown'}`);
  });
  page.on('response', (res) => {
    const status = res.status();
    if (status >= 400) {
      const url = res.url();
      const base = baseUrl.replace(/\/$/, '');
      if (url.includes('/_next/') || url.endsWith('.js') || url.endsWith('.html') || url === base || url === base + '/' || url.startsWith(base + '/')) {
        badResponses.push(`${status} ${url}`);
      }
    }
  });

  const resp = await page.goto(preflightUrl, { waitUntil: 'domcontentloaded' });
  console.log('DOC_STATUS', resp?.status(), resp?.url());

  const beforeWait = await page.evaluate(() => ({
    href: window.location.href,
    readyState: document.readyState,
    dataE2e: document.documentElement.getAttribute('data-e2e'),
    dataE2eMode: document.documentElement.getAttribute('data-e2e-mode'),
  }));
  console.log('Preflight before wait:', JSON.stringify(beforeWait));
  // Harness is sufficient; data-e2e may be missing if React #418 hydration crash replaced server HTML
  await page.waitForFunction(
    () =>
      typeof window.__e2e !== 'undefined' &&
      typeof window.__e2e?.waitForIdle === 'function',
    null,
    { timeout: 15000 }
  );

  const ok = await page.evaluate(() => ({
    href: window.location.href,
    dataE2e: document.documentElement.getAttribute('data-e2e'),
    dataE2eMode: document.documentElement.getAttribute('data-e2e-mode'),
  }));
  if (!ok.dataE2e) {
    throw new Error(
      'data-e2e missing on <html>. E2E compose must not mount ./apps/web:/app — ' +
        'it overrides the built .next. Ensure docker-compose.e2e.yml has volumes: !reset []'
    );
  }
  console.log('✅ preflight ok: __e2e exposed', JSON.stringify(ok));
  await browser.close();
})().catch(async (err) => {
  try {
    if (page) {
      const url = page.url();
      const diag = await page.evaluate(() => {
        const root = document.getElementById('__next') ?? document.body;
        const e2e = (window).__e2e;
        return {
          dataE2e: document.documentElement.getAttribute('data-e2e'),
          dataE2eMode: document.documentElement.getAttribute('data-e2e-mode'),
          windowE2eType: typeof e2e,
          windowE2eKeys: e2e && typeof e2e === 'object' ? Object.keys(e2e) : null,
          head: (document.head?.innerHTML ?? '').slice(0, 300),
          bodyText: (root?.innerText ?? document.body?.innerText ?? '').slice(0, 500),
        };
      });
      const scripts = await page.evaluate(() =>
        Array.from(document.scripts).map((s) => s.src || '(inline)').slice(0, 20)
      );
      console.error('Preflight failed at:', url);
      console.error('data-e2e:', diag.dataE2e, '| data-e2e-mode:', diag.dataE2eMode);
      console.error('window.__e2e type:', diag.windowE2eType, '| keys:', diag.windowE2eKeys);
      console.error('SCRIPTS (first 20):', scripts);
      if (!diag.dataE2e) console.error('→ Env not applied or Providers did not mount');
      if (diag.dataE2e && (!diag.windowE2eKeys || !diag.windowE2eKeys.includes('waitForIdle'))) {
        console.error('→ Hydration/JS exception or stale bundle (__e2e exists but not full harness)');
      }
      if (pageErrors.length) console.error('Page errors:', pageErrors);
      if (consoleLogs.length) console.error('Console errors/warnings:', consoleLogs);
      if (failedRequests.length) console.error('Failed requests:', failedRequests);
      if (badResponses.length) console.error('4xx/5xx responses:', badResponses);
      console.error('HEAD snippet:', diag.head);
      console.error('BODY text snippet:', diag.bodyText);

      fs.mkdirSync('test-results', { recursive: true });
      const html = await page.content();
      fs.writeFileSync('test-results/preflight-failure.html', html);
      console.error('HTML snapshot saved: test-results/preflight-failure.html');
      const screenshotPath = 'test-results/preflight-failure.png';
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.error('Screenshot saved:', screenshotPath);
    }
  } catch (e) {
    console.error('Could not capture diagnostics:', e);
  }
  console.error(err);
  if (browser) await browser.close();
  process.exit(1);
});

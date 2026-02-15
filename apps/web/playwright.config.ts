import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const SKIP_WEBSERVER = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1';

/**
 * Playwright configuration for Evidence Inspector tests
 *
 * Env: BASE_URL, PLAYWRIGHT_SKIP_WEBSERVER, BACKEND_URL, ARTIFACT_ENABLE_TEST_SEED, ARTIFACT_E2E_MODE
 *
 * Mode A (Playwright starts dev server): npm run test:e2e:canary
 * Mode B (manual server): PLAYWRIGHT_SKIP_WEBSERVER=1 BASE_URL=http://localhost:3000 npm run test:e2e:canary
 *
 * Gate order: release-gate (Docker/CI) → synthesis cluster → full suite
 *   npm run test:e2e:release-gate  # Gate 1 (@release-gate: 7 tests, zero skips; wiring only)
 *   npm run test:e2e:synthesis     # Gate 2
 *   npm run test:e2e:nightly       # @nightly: clipboard, demo seed, seed-contract (until fixed)
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html'], ['json', { outputFile: 'test-results/pw.json' }]],

  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 720 },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  
  // Output directory for test artifacts (screenshots, videos, traces)
  outputDir: 'test-results/',
  
  // Global setup for E2E environment
  globalSetup: require.resolve('./tests/e2e/global-setup.ts'),

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: !SKIP_WEBSERVER
    ? {
        command: 'npx next dev -H 0.0.0.0 -p 3000',
        url: `${BASE_URL}/`,
        reuseExistingServer: true,
        timeout: 120_000,
        env: {
          ...process.env,
          NEXT_PUBLIC_E2E_MODE: 'true',
          NODE_OPTIONS: [process.env.NODE_OPTIONS, '--no-deprecation'].filter(Boolean).join(' '),
        },
      }
    : undefined,
});

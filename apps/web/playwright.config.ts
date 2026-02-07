import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Evidence Inspector tests
 * 
 * Install: npm install -D @playwright/test && npx playwright install
 * Run: npm run test:e2e
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry', // Keep trace only on retry (reduces overhead)
    screenshot: 'only-on-failure', // Screenshots only when test fails
    video: 'retain-on-failure', // Video only on failure
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

  // Run dev server before tests (skip if PLAYWRIGHT_SKIP_WEBSERVER=1)
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER !== '1' ? {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  } : undefined,
});

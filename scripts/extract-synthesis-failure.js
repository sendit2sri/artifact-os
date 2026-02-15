#!/usr/bin/env node
/**
 * Extract one clickGenerateAndWaitForPost failure from pw.json.
 * Run after: npx playwright test export-quick-actions --project=chromium
 * Usage: node scripts/extract-synthesis-failure.js
 */
const fs = require('fs');
const path = require('path');
const pwPath = path.join(__dirname, '../apps/web/test-results/pw.json');
if (!fs.existsSync(pwPath)) {
  console.error('pw.json not found. Run E2E tests first.');
  process.exit(1);
}
const j = JSON.parse(fs.readFileSync(pwPath, 'utf8'));
const errs = [];
function walk(s) {
  if (!s) return;
  if (s.specs)
    s.specs.forEach((sp) =>
      sp.tests.forEach((t) =>
        t.results.forEach((r) => {
          if (r.error && r.error.message) {
            const msg = r.error.message;
            if (msg.includes('clickGenerateAndWaitForPost') && msg.includes('Recent requests')) {
              errs.push(msg);
            }
          }
        })
      )
    );
  if (s.suites) s.suites.forEach(walk);
}
walk(j);
if (errs.length === 0) {
  console.log('No clickGenerateAndWaitForPost failure with Recent requests found in pw.json.');
  console.log('Run: cd apps/web && ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true npx playwright test export-quick-actions --project=chromium');
  process.exit(0);
}
console.log(errs[0]);

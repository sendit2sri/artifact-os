const fs = require('fs');
const path = require('path');
const pwPath = process.argv[2] || path.join(__dirname, '../apps/web/test-results/pw.json');
if (!fs.existsSync(pwPath)) {
  console.error('pw.json not found. Run E2E tests first to generate it:');
  console.error('  cd apps/web && ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true npm run test:e2e:ci');
  console.error('');
  console.error('Or pass a path: node scripts/summarize-pw-errors.js /path/to/pw.json');
  process.exit(1);
}
const j = JSON.parse(fs.readFileSync(pwPath, 'utf8'));
const errs = [];
function walk(s) {
  if (!s) return;
  if (s.errors) s.errors.forEach((e) => errs.push((e.message || '').split('\n')[0]));
  if (s.suites) s.suites.forEach(walk);
  if (s.specs)
    s.specs.forEach((sp) =>
      sp.tests.forEach((t) =>
        t.results.forEach((r) => r.error && errs.push((r.error.message || '').split('\n')[0]))
      )
    );
}
walk(j);
const m = new Map();
errs.forEach((e) => m.set(e, (m.get(e) || 0) + 1));
console.log(
  [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([e, c]) => c + '  ' + e)
    .join('\n')
);

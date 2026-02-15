/**
 * Global setup for Playwright E2E tests.
 * Runs once per run (not per worker). Validates frontend + backend + E2E mode.
 */

async function fetchWithTimeout(
  url: string,
  ms = 5000,
  init?: RequestInit
): Promise<Response | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function globalSetup() {
  const BASE_URL = process.env.BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
  const SKIP_WEBSERVER = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1';

  console.log('🔧 E2E Global Setup\n');
  console.log(`   BASE_URL:    ${BASE_URL}`);
  console.log(`   BACKEND_URL: ${BACKEND_URL}`);
  console.log(`   SKIP_WEBSERVER: ${SKIP_WEBSERVER}\n`);
  
  console.log('0️⃣  Validating E2E environment (fail-fast)...');
  const missing: string[] = [];
  if (process.env.ARTIFACT_ENABLE_TEST_SEED !== 'true') {
    missing.push('ARTIFACT_ENABLE_TEST_SEED=true');
  }
  if (process.env.ARTIFACT_E2E_MODE !== 'true') {
    missing.push('ARTIFACT_E2E_MODE=true');
  }
  if (missing.length > 0) {
    throw new Error(
      `❌ E2E env guard failed. Set:\n   ${missing.join('\n   ')}\n` +
      `   Example: ARTIFACT_ENABLE_TEST_SEED=true ARTIFACT_E2E_MODE=true npm run test:e2e:ci`
    );
  }
  if (SKIP_WEBSERVER && process.env.NEXT_PUBLIC_E2E_MODE !== 'true') {
    console.log('   ⚠️  With PLAYWRIGHT_SKIP_WEBSERVER=1, set NEXT_PUBLIC_E2E_MODE=true on your dev server for __e2e harness\n');
  }
  console.log('   ✅ E2E env vars OK\n');

  try {
    // 0. Frontend reachability (when using PLAYWRIGHT_SKIP_WEBSERVER=1)
    if (SKIP_WEBSERVER) {
      console.log('0️⃣  Checking frontend availability...');
      const fe = await fetchWithTimeout(BASE_URL);
      if (!fe || !fe.ok) {
        const port = new URL(BASE_URL).port || '80';
        throw new Error(
          `❌ Frontend is not reachable at ${BASE_URL}\n` +
          `   Port ${port} is not responding. Fix:\n` +
          `   - Start frontend: cd apps/web && npm run dev (may use 3000 or 3001 if 3000 is busy)\n` +
          `   - Set BASE_URL to match (e.g. BASE_URL=http://localhost:3001)\n` +
          `   - Or remove PLAYWRIGHT_SKIP_WEBSERVER=1 and let Playwright start the web server`
        );
      }
      console.log('   ✅ Frontend is running\n');
    }

    // 1. Backend health
    console.log('1️⃣  Checking backend health...');
    const healthResponse = await fetchWithTimeout(`${BACKEND_URL}/health`);
    if (!healthResponse || !healthResponse.ok) {
      throw new Error(
        `❌ Backend is not reachable at ${BACKEND_URL}\n` +
        `   Fix: start backend with ARTIFACT_ENABLE_TEST_SEED=true and ARTIFACT_E2E_MODE=true\n` +
        `   Example: docker-compose up -d backend worker db redis (with .env vars)`
      );
    }
    console.log('   ✅ Backend is running\n');

    // 2. Verify test seed endpoint is enabled
    console.log('2️⃣  Checking test seed endpoint...');
    const seedResponse = await fetchWithTimeout(
      `${BACKEND_URL}/api/v1/test/seed`,
      15_000,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true, outputs_count: 2 }),
      }
    );
    if (!seedResponse) {
      throw new Error('Test seed request timed out (15s). Is backend running?');
    }
    if (seedResponse.status === 403) {
      throw new Error(
        '❌ Test seed endpoint disabled.\n' +
        '   Fix: set ARTIFACT_ENABLE_TEST_SEED=true (backend env)'
      );
    }
    const seedUrl = `${BACKEND_URL}/api/v1/test/seed`;
    if (!seedResponse.ok) {
      const err = await seedResponse.text();
      const snippet = err.slice(0, 200);
      throw new Error(
        `Test seed failed: ${seedResponse.status}\n` +
        `   URL: ${seedUrl}\n` +
        `   Body: ${snippet}${err.length > 200 ? '...' : ''}`
      );
    }
    const seedData = await seedResponse.json();
    const projectId = seedData.project_id;
    const factsCount = typeof seedData.facts_count === 'number' ? seedData.facts_count : 0;
    const rawSnippet = JSON.stringify(seedData).slice(0, 200);
    if (!projectId) {
      throw new Error(
        `Seed response missing project_id\n` +
        `   URL: ${seedUrl}\n` +
        `   Response: ${rawSnippet}...`
      );
    }
    if (factsCount < 1) {
      throw new Error(
        `Seed response: facts_count must be >= 1 (prevents "fact-card not found" flakes), got ${factsCount}\n` +
        `   URL: ${seedUrl}\n` +
        `   Response: ${rawSnippet}...`
      );
    }
    console.log(`   ✅ Seed OK (project=${String(projectId).slice(0, 8)}..., facts=${factsCount})\n`);

    // 2b. Smoke: outputs list API returns seeded outputs
    const outputsRes = await fetchWithTimeout(
      `${BACKEND_URL}/api/v1/projects/${projectId}/outputs?limit=20&offset=0`,
      10_000
    );
    if (!outputsRes || !outputsRes.ok) {
      throw new Error(`Outputs API failed: ${outputsRes.status}`);
    }
    const outputs = await outputsRes.json();
    if (!Array.isArray(outputs) || outputs.length < 2) {
      throw new Error(`Expected >=2 seeded outputs, got ${outputs?.length ?? 0}`);
    }
    console.log(`   ✅ Outputs API OK (${outputs.length} seeded)\n`);

    // 3. Validate E2E mode via synthesis call
    console.log('3️⃣  Validating E2E mode (deterministic synthesis)...');
    const synthResponse = await fetchWithTimeout(
      `${BACKEND_URL}/api/v1/projects/${projectId}/synthesize`,
      15_000,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facts: [
            { id: 'v1', text: 'Test fact 1', title: 'Test', url: 'https://example.com' },
            { id: 'v2', text: 'Test fact 2', title: 'Test', url: 'https://example.com' },
          ],
          mode: 'paragraph',
        }),
      }
    );
    if (!synthResponse || !synthResponse.ok) {
      const err = synthResponse ? await synthResponse.text() : 'Request timed out';
      throw new Error(
        `Synthesis check failed: ${synthResponse?.status ?? 'timeout'}. Set ARTIFACT_E2E_MODE=true. ${err}`
      );
    }
    const synth = await synthResponse.json();
    const ok =
      synth.synthesis &&
      (synth.synthesis.includes('E2E Synthesis') ||
        synth.synthesis.includes('Sources:') ||
        synth.synthesis.includes('Mode:'));
    if (!ok) {
      throw new Error(
        '❌ E2E mode not enabled (no deterministic markers).\n' +
        '   Fix: set ARTIFACT_E2E_MODE=true (backend env)'
      );
    }
    console.log('   ✅ E2E mode confirmed\n');
    console.log('✅ Backend ready for E2E tests\n');
  } catch (error) {
    console.error('❌ E2E Setup Failed:', error);
    throw error;
  }
}

export default globalSetup;

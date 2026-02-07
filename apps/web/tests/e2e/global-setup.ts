/**
 * Global setup for Playwright E2E tests.
 * Runs once per run (not per worker). Validates backend and E2E mode only.
 */

async function globalSetup() {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

  console.log('🔧 E2E Global Setup: Validating backend...\n');

  try {
    // 1. Backend health
    console.log('1️⃣  Checking backend health...');
    const healthResponse = await fetch(`${BACKEND_URL}/health`, { method: 'GET' });
    if (!healthResponse.ok) {
      throw new Error(`Backend health check failed: ${healthResponse.status}`);
    }
    console.log('   ✅ Backend is running\n');

    // 2. Verify test seed endpoint is enabled
    console.log('2️⃣  Checking test seed endpoint...');
    const seedResponse = await fetch(`${BACKEND_URL}/api/v1/test/seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset: true }),
    });
    if (seedResponse.status === 403) {
      throw new Error(
        '❌ Test seed endpoint disabled. Set ARTIFACT_ENABLE_TEST_SEED=true'
      );
    }
    if (!seedResponse.ok) {
      const err = await seedResponse.text();
      throw new Error(`Test seed failed: ${seedResponse.status} - ${err}`);
    }
    const seedData = await seedResponse.json();
    const projectId = seedData.project_id;
    console.log(`   ✅ Seed OK (project=${projectId?.slice(0, 8)}...)\n`);

    // 3. Validate E2E mode via synthesis call
    console.log('3️⃣  Validating E2E mode (deterministic synthesis)...');
    const synthResponse = await fetch(
      `${BACKEND_URL}/api/v1/projects/${projectId}/synthesize`,
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
    if (!synthResponse.ok) {
      const err = await synthResponse.text();
      throw new Error(
        `Synthesis check failed: ${synthResponse.status}. Set ARTIFACT_E2E_MODE=true. ${err}`
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
        '❌ E2E mode not enabled (no deterministic markers). Set ARTIFACT_E2E_MODE=true'
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

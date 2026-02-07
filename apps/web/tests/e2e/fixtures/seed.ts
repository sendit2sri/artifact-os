/**
 * Worker-scoped seed fixture. Seeds once per worker and exposes project_id, source_id, facts_count.
 */

import * as fs from 'fs';
import * as path from 'path';
import { test as base } from '@playwright/test';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const WORKER_INDEX = process.env.TEST_PARALLEL_INDEX ?? '0';

export interface SeedFixture {
  project_id: string;
  source_id: string;
  facts_count: number;
}

async function seedWorker(): Promise<SeedFixture> {
  const res = await fetch(`${BACKEND_URL}/api/v1/test/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reset: true }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Seed failed: ${res.status} - ${err}`);
  }
  const data = await res.json();
  return {
    project_id: data.project_id,
    source_id: data.source_id,
    facts_count: data.facts_count ?? 3,
  };
}

export const test = base.extend<{ seed: SeedFixture }>({
  seed: [
    async ({}, use) => {
      const seedData = await seedWorker();
      const outDir = path.join(process.cwd(), 'test-results');
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      const filePath = path.join(outDir, `e2e-seed-worker-${WORKER_INDEX}.json`);
      fs.writeFileSync(filePath, JSON.stringify(seedData, null, 2));
      await use(seedData);
    },
    { scope: 'worker' },
  ],
});

export { expect } from '@playwright/test';

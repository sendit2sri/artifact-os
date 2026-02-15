/**
 * Worker-scoped seed fixture. Runs once per worker; uses Playwright workerInfo
 * for deterministic project_id/source_id. No env var or file dependency.
 */

import * as fs from 'fs';
import * as path from 'path';
import { test as base } from '@playwright/test';
import type { WorkerInfo } from '@playwright/test';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export interface SeedVerification {
  expected_facts: number;
  actual_facts: number;
  has_approved: boolean;
  has_pinned: boolean;
  has_evidence: boolean;
}

export interface KnownFactIds {
  approved_1: string;
  approved_2: string;
  pinned_1: string;
  duplicate_original: string;
  duplicate_suppressed: string;
  similar_rep: string;
  no_snippet: string;
}

export interface SeedFixture {
  project_id: string;
  source_id: string;
  facts_count: number;
  outputs_count?: number;
  seed_verification: SeedVerification;
  known_fact_ids: KnownFactIds;
}

function getWorkerId(workerInfo: WorkerInfo | undefined): number {
  if (workerInfo == null) return 0;
  return (
    (workerInfo as { parallelIndex?: number }).parallelIndex ??
    (workerInfo as { workerIndex?: number }).workerIndex ??
    0
  );
}

function deterministicIds(workerId: number): { project_id: string; source_id: string } {
  const suffix = String(workerId).padStart(2, '0');
  return {
    project_id: `123e4567-e89b-12d3-a456-4266141740${suffix}`,
    source_id: `223e4567-e89b-12d3-a456-4266141740${suffix}`,
  };
}

export interface SeedOptions {
  facts_count?: number;
  outputs_count?: number;
  with_similar_facts?: boolean;
}

async function seedWorker(
  projectId: string,
  sourceId: string,
  options: SeedOptions = {}
): Promise<SeedFixture> {
  const facts_count = options.facts_count ?? 4;
  const outputs_count = options.outputs_count ?? 2;
  
  // Build seed payload - omit optional flags to let backend defaults apply (kitchen sink mode)
  const seedPayload: Record<string, unknown> = {
    project_id: projectId,
    source_id: sourceId,
    facts_count,
    outputs_count,
    reset: true,
  };
  
  // Only include with_similar_facts if explicitly set (otherwise use backend default)
  if (options.with_similar_facts !== undefined) {
    seedPayload.with_similar_facts = options.with_similar_facts;
  }
  
  const res = await fetch(`${BACKEND_URL}/api/v1/test/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(seedPayload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Seed failed: ${res.status} - ${err}`);
  }
  const data = await res.json();
  
  // Verify seed using backend's seed_verification response
  const verification = data.seed_verification;
  if (!verification) {
    throw new Error('Seed response missing verification data');
  }
  
  // Assert critical invariants for E2E stability
  if (verification.actual_facts === 0) {
    throw new Error(`Seed verification failed: expected ${verification.expected_facts} facts but got 0`);
  }
  
  if (!verification.has_approved) {
    throw new Error(`Seed verification failed: kitchen sink should have >=2 approved facts, got ${data.approved_count}`);
  }
  
  if (!verification.has_evidence) {
    throw new Error(`Seed verification failed: no facts have evidence (evidence panel tests will fail). Got ${data.evidence_count} facts with evidence.`);
  }
  
  console.log(`✅ Seed verified: ${data.facts_count} facts (${data.approved_count} approved, ${data.pinned_count} pinned, ${data.evidence_count} with evidence)`);
  
  const actualFactsCount = data.facts_count;
  const knownIds = data.known_fact_ids;
  if (!knownIds) {
    throw new Error('Seed response missing known_fact_ids');
  }

  return {
    project_id: data.project_id,
    source_id: data.source_id,
    facts_count: actualFactsCount,
    outputs_count: data.outputs_count ?? 0,
    seed_verification: verification,
    known_fact_ids: knownIds,
  };
}

/** Deterministic IDs for seedLarge (workers 0,1,2 -> 20,21,22) to avoid clash. */
function deterministicIdsLarge(workerId: number): { project_id: string; source_id: string } {
  const suffix = String(20 + workerId);
  return {
    project_id: `123e4567-e89b-12d3-a456-4266141740${suffix}`,
    source_id: `223e4567-e89b-12d3-a456-4266141740${suffix}`,
  };
}

export const test = base.extend<{}, { seed: SeedFixture; seedLarge: SeedFixture }>({
  seed: [
    async ({}, use, workerInfo: WorkerInfo) => {
      const workerId = getWorkerId(workerInfo);
      const { project_id, source_id } = deterministicIds(workerId);
      const seedData = await seedWorker(project_id, source_id);

      const outDir = path.join(process.cwd(), 'test-results');
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(
        path.join(outDir, `e2e-seed-worker-${workerId}.json`),
        JSON.stringify(seedData, null, 2)
      );

      await use(seedData);
    },
    { scope: 'worker' },
  ],
  seedLarge: [
    async ({}, use, workerInfo: WorkerInfo) => {
      const workerId = getWorkerId(workerInfo);
      const { project_id, source_id } = deterministicIdsLarge(workerId);
      const seedData = await seedWorker(project_id, source_id, { facts_count: 400, outputs_count: 0 });

      await use(seedData);
    },
    { scope: 'worker' },
  ],
});

export { expect } from '@playwright/test';

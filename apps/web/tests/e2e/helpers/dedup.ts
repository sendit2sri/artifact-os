/**
 * Dedup E2E helpers.
 */

import { Page, expect } from '@playwright/test';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

/** Seed project with near-duplicate facts for dedup E2E */
export async function seedWithNearDuplicate(projectId: string, sourceId: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/v1/test/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      source_id: sourceId,
      facts_count: 4,
      outputs_count: 0,
      reset: true,
      with_near_duplicate: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Seed with near duplicate failed: ${res.status} - ${err}`);
  }
}

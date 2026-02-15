/**
 * Trust Gate / Generate from Approved-Pinned E2E helpers.
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

/** Seed project with pinned facts (for generate-from-pinned E2E) */
export async function seedWithPinnedFacts(projectId: string, sourceId: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/v1/test/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      source_id: sourceId,
      facts_count: 4,
      outputs_count: 0,
      reset: true,
      with_pinned_facts: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Seed with pinned facts failed: ${res.status} - ${err}`);
  }
}

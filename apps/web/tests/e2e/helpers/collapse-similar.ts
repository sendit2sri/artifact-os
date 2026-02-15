/**
 * Collapse Similar / Cluster Preview E2E helpers.
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

/** Seed project with token-similar facts for collapse-similar E2E */
export async function seedWithSimilarFacts(
  projectId: string,
  sourceId: string
): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/v1/test/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      source_id: sourceId,
      facts_count: 4,
      outputs_count: 0,
      reset: true,
      with_similar_facts: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Seed with similar facts failed: ${res.status} - ${err}`);
  }
}

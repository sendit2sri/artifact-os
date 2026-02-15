/**
 * Capture Excerpt E2E helpers.
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

/** Seed project with source that has no content (for capture-excerpt-no-content E2E) */
export async function seedWithSourceNoContent(projectId: string, sourceId: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/v1/test/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      source_id: sourceId,
      facts_count: 1,
      outputs_count: 0,
      reset: true,
      with_source_no_content: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Seed with source no content failed: ${res.status} - ${err}`);
  }
}

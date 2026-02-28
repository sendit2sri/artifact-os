const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

import { randomUUID } from "@/lib/utils";
import type { FactView } from "@/types/factView";
export type { FactView };

export interface Project {
  id: string;
  title: string;
  workspace_id: string;
  created_at: string;
}

export interface Fact {
  id: string;
  fact_text: string;
  source_doc_id: string;
  source_url: string;
  source_domain: string;
  confidence_score: number;
  section_context?: string;
  tags?: string[];
  is_key_claim: boolean;
  // ✅ Updated to match backend enum (uppercase)
  review_status: "PENDING" | "APPROVED" | "FLAGGED" | "REJECTED" | "NEEDS_REVIEW";
  is_pinned?: boolean;
  quote_text_raw?: string;
  /** Optional aliases when mapping to LlmFactInput (e.g. from UI or normalized payloads) */
  text?: string;
  title?: string;
  url?: string;
  section?: string | null;
  // Evidence offset anchors for precise highlighting
  evidence_start_char_raw?: number;
  evidence_end_char_raw?: number;
  evidence_start_char_md?: number;
  evidence_end_char_md?: number;
  evidence_snippet?: string | null;
  is_suppressed?: boolean;
  canonical_fact_id?: string | null;
  duplicate_group_id?: string | null;
  /** When group_similar=1: stable group id for representative fact */
  group_id?: string;
  /** When group_similar=1: count of facts in group (only on rep) */
  collapsed_count?: number;
}

/** Map backend Fact (or fact-like) to UI FactView at API boundary */
export function toFactView(f: Fact | Record<string, unknown>): FactView {
  const r = f as Record<string, unknown>;
  const text = (r.text ?? r.fact_text ?? "") as string;
  const url = (r.url ?? r.source_url) as string | undefined;
  return {
    id: (r.id as string) ?? "",
    text: typeof text === "string" ? text : "",
    title: r.title as string | undefined,
    url: typeof url === "string" ? url : undefined,
    section: (r.section ?? r.section_context) as string | null | undefined,
    review_status: r.review_status as FactView["review_status"],
    is_pinned: r.is_pinned as boolean | undefined,
  };
}

export interface Job {
  id: string;
  project_id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  created_at: string;
  params: {
    url: string;
    filename?: string;
    depth?: number;
    source_type?: "WEB" | "REDDIT" | "YOUTUBE";
    canonical_url?: string;
  };
  result_summary?: {
    source_title?: string;
    facts_count?: number;
    summary?: string | string[];
    source_type?: "WEB" | "REDDIT" | "YOUTUBE";
    error_code?: string;
    error_message?: string;
    is_duplicate?: boolean;
    message?: string;
  };
  current_step?: string;
  error_message?: string;
}

export interface QualityStats {
  total: number;
  approved: number;
  needs_review: number;
  flagged: number;
  rejected: number;
  pinned: number;
}

export interface Output {
  id: string;
  project_id: string;
  title: string;
  content: string;
  output_type: string;
  mode: string;
  fact_ids: string[];
  source_count: number;
  is_pinned?: boolean;
  quality_stats?: QualityStats | null;
  created_at: string;
  updated_at: string;
}

/** Evidence map fact from GET /outputs/{id}/evidence_map */
export interface OutputEvidenceMapFact {
  id: string;
  fact_text: string;
  review_status: string;
  is_pinned: boolean;
  is_key_claim: boolean;
  source_type?: string | null;
  source_url?: string | null;
  source_domain?: string | null;
  evidence_snippet?: string | null;
  has_excerpt: boolean;
  evidence_start_char_raw?: number | null;
  evidence_end_char_raw?: number | null;
}

/** Evidence map source from GET /outputs/{id}/evidence_map */
export interface OutputEvidenceMapSource {
  domain: string;
  url: string;
  source_type?: string | null;
}

/** Response from GET /outputs/{id}/evidence_map */
export interface OutputEvidenceMapResponse {
  output_id: string;
  facts: OutputEvidenceMapFact[];
  sources: OutputEvidenceMapSource[];
}

/** List item from GET /projects/{id}/outputs (no full content) */
export interface OutputSummary {
  id: string;
  title: string;
  created_at: string | null;
  source_count: number;
  fact_ids_count: number;
  preview: string;
  mode: string;
  is_pinned?: boolean;
  quality_stats?: QualityStats | null;
}

// --- WORKSPACES & PREFERENCES ---

export interface Workspace {
  id: string;
  name: string;
  created_at: string;
}

export async function fetchWorkspaces(signal?: AbortSignal): Promise<Workspace[]> {
  const res = await fetch(`${API_URL}/workspaces`, { signal });
  if (!res.ok) throw new Error("Failed to fetch workspaces");
  return res.json();
}

export async function fetchWorkspaceProjects(workspaceId: string, signal?: AbortSignal): Promise<Project[]> {
  const res = await fetch(`${API_URL}/workspaces/${workspaceId}/projects`, { signal });
  if (!res.ok) throw new Error("Failed to fetch workspace projects");
  return res.json();
}

export async function fetchPreferences(
  workspaceId: string,
  projectId?: string | null,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const url = projectId
    ? `${API_URL}/workspaces/${workspaceId}/preferences?project_id=${encodeURIComponent(projectId)}`
    : `${API_URL}/workspaces/${workspaceId}/preferences`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("Failed to fetch preferences");
  return res.json();
}

export async function putPreference(
  workspaceId: string,
  payload: { project_id?: string | null; key: string; value_json: unknown },
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_URL}/workspaces/${workspaceId}/preferences`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) throw new Error("Failed to save preference");
}

// --- PROJECT MANAGEMENT ---

export async function createProject(workspaceId: string, title: string) {
  const res = await fetch(`${API_URL}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace_id: workspaceId, title }),
  });
  
  // Handle 502 Gateway Error
  if (res.status === 502) {
    throw new Error("Backend is starting up, please wait a moment and try again.");
  }
  
  if (!res.ok) throw new Error("Failed to create project");
  return res.json();
}

export async function fetchProject(id: string, signal?: AbortSignal) {
  const res = await fetch(`${API_URL}/projects/${id}`, { signal });
  if (!res.ok) throw new Error("Failed to fetch project");
  return res.json();
}

export async function updateProjectName(
  projectId: string,
  title: string,
  signal?: AbortSignal
): Promise<Project> {
  const res = await fetch(`${API_URL}/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
    signal,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Failed to rename project");
  }
  return res.json();
}

// Removed old resetProject that called deleteJob multiple times
// New implementation uses backend's dedicated reset endpoint

// --- INGESTION ---

export async function ingestUrl(projectId: string, workspaceId: string, url: string) {
  const res = await fetch(`${API_URL}/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, workspace_id: workspaceId, url }),
  });
  
  // Handle 502 Gateway Error
  if (res.status === 502) {
    throw new Error("Backend is starting up, please wait a moment and try again.");
  }
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error("Ingest failed:", res.status, errorText);
    throw new Error(`Ingest failed: ${res.status} ${errorText.substring(0, 100)}`);
  }
  return res.json();
}

/** Demo seed: calls test/seed when NEXT_PUBLIC_ENABLE_TEST_SEED is set. Resets project and creates sample facts. */
export async function seedDemoProject(projectId: string): Promise<{ project_id: string; facts_count: number }> {
  const sourceId = randomUUID();
  const res = await fetch(`${API_URL}/test/seed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: projectId,
      source_id: sourceId,
      facts_count: 4,
      outputs_count: 0,
      reset: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Demo seed failed");
  }
  return res.json();
}

/** Multi-source demo seed: Reddit and/or YouTube (E2E deterministic). Only when NEXT_PUBLIC_ENABLE_TEST_SEED=true. */
export async function seedDemoSources(
  projectId: string,
  sources: ("reddit" | "youtube")[],
  reset: boolean = true
): Promise<{ status: string; job_ids: string[]; source_ids: string[] }> {
  const res = await fetch(`${API_URL}/test/seed_sources`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, reset, sources }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Demo sources seed failed");
  }
  return res.json();
}

/** Retry ingestion for a source by canonical_url + source_type (preserves type, creates new job). */
export async function retrySource(
  projectId: string,
  canonicalUrl: string,
  sourceType: "WEB" | "REDDIT" | "YOUTUBE"
): Promise<{ job_id: string }> {
  const res = await fetch(`${API_URL}/projects/${projectId}/sources/retry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ canonical_url: canonicalUrl, source_type: sourceType }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Retry failed");
  }
  return res.json();
}

export async function uploadFile(projectId: string, workspaceId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const params = new URLSearchParams({ project_id: projectId, workspace_id: workspaceId });

  const res = await fetch(`${API_URL}/ingest/file?${params}`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error("File upload failed");
  return res.json();
}

// --- DATA FETCHING ---

export interface FactsFilter {
  filter?: "all" | "needs_review" | "key_claims" | "approved" | "flagged" | "rejected" | "pinned";
  sort?: "newest" | "confidence" | "key_claims";
  order?: "asc" | "desc";
  show_suppressed?: boolean;
  group_similar?: 0 | 1;
  min_sim?: number;
  group_limit?: number;
}

export interface FactsGroupedResponse {
  items: Fact[];
  groups: Record<string, { collapsed_ids: string[]; collapsed_count: number }>;
}

export async function fetchProjectFacts(
  projectId: string,
  filters?: FactsFilter
): Promise<Fact[] | FactsGroupedResponse> {
  const params = new URLSearchParams();

  if (filters?.filter) {
    params.append("filter", filters.filter);
  }
  if (filters?.sort) {
    params.append("sort", filters.sort);
  }
  if (filters?.order) {
    params.append("order", filters.order);
  }
  if (filters?.show_suppressed) {
    params.append("show_suppressed", "true");
  }
  if (filters?.group_similar === 1) {
    params.append("group_similar", "1");
    params.append("min_sim", String(filters.min_sim ?? 0.88));
    if (filters.group_limit != null) params.append("group_limit", String(filters.group_limit));
  }

  const url = `${API_URL}/projects/${projectId}/facts${params.toString() ? `?${params.toString()}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch facts");
  const data = (await res.json()) as unknown;
  if (!data || typeof data !== "object") return [] as Fact[];
  if (Array.isArray(data)) return data as Fact[];
  const grouped = data as FactsGroupedResponse;
  return grouped;
}

export async function fetchFactsGroup(
  projectId: string,
  groupId: string,
  signal?: AbortSignal
): Promise<Fact[]> {
  const res = await fetch(
    `${API_URL}/projects/${projectId}/facts/group/${encodeURIComponent(groupId)}`,
    { signal }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Failed to fetch group facts");
  }
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as Fact[]) : [];
}

export async function fetchProjectJobs(projectId: string) {
  const res = await fetch(`${API_URL}/projects/${projectId}/jobs`);
  if (!res.ok) throw new Error("Failed to fetch jobs");
  return res.json() as Promise<Job[]>;
}

export interface DedupResponse {
  groups: { group_id: string; canonical_fact_id: string; fact_ids: string[]; reason: string; score: number }[];
  suppressed_count: number;
}

export async function dedupFacts(
  projectId: string,
  opts: { threshold?: number; limit?: number } = {},
  signal?: AbortSignal
): Promise<DedupResponse> {
  const res = await fetch(`${API_URL}/projects/${projectId}/facts/dedup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threshold: opts.threshold ?? 0.92, limit: opts.limit ?? 500 }),
    signal,
  });
  if (!res.ok) throw new Error("Dedup failed");
  return res.json() as Promise<DedupResponse>;
}

export interface SourceSummary {
  source_url: string;
  domain: string;
  title: string;
  status: "COMPLETED" | "FAILED" | "RUNNING";
  facts_total: number;
  key_claims: number;
  needs_review: number;
  pinned: number;
  last_error: string | null;
}

export async function fetchSourcesSummary(
  projectId: string,
  signal?: AbortSignal
): Promise<SourceSummary[]> {
  const res = await fetch(`${API_URL}/projects/${projectId}/sources/summary`, { signal });
  if (!res.ok) throw new Error("Failed to fetch sources summary");
  return res.json() as Promise<SourceSummary[]>;
}

export interface SourceContent {
  content: string;          // Primary content in requested format
  format: "text" | "markdown" | "html";
  text: string | null;      // Raw text (always available)
  markdown: string | null;  // Markdown format (if available)
  html: string | null;      // Sanitized HTML (if available)
  title: string | null;     // Page title
  url: string;              // Source URL
  domain: string;           // Domain name
}

export interface EvidenceSource {
  domain: string;
  url: string;
  title?: string | null;
  excerpt?: string | null;
  source_type?: "WEB" | "REDDIT" | "YOUTUBE";
}

export interface EvidenceResponse {
  fact_id: string;
  fact_text: string;
  evidence_snippet?: string | null;
  evidence_start_char_raw?: number | null;
  evidence_end_char_raw?: number | null;
  evidence_start_char_md?: number | null;
  evidence_end_char_md?: number | null;
  sources: EvidenceSource[];
  highlights?: string[] | null;
  updated_at?: string | null;
}

export async function fetchFactEvidence(
  projectId: string,
  factId: string,
  signal?: AbortSignal
): Promise<EvidenceResponse> {
  const res = await fetch(
    `${API_URL}/projects/${projectId}/facts/${factId}/evidence`,
    { signal }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Failed to fetch evidence");
  }
  return res.json() as Promise<EvidenceResponse>;
}

export interface CaptureExcerptParams {
  source_url: string;
  format: "raw" | "markdown";
  start: number;
  end: number;
}

export async function captureExcerpt(
  projectId: string,
  factId: string,
  params: CaptureExcerptParams,
  signal?: AbortSignal
): Promise<{ ok: boolean; fact: Record<string, unknown> }> {
  const res = await fetch(
    `${API_URL}/projects/${projectId}/facts/${factId}/capture_excerpt`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal,
    }
  );
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body.detail as string) || "Source content not available yet");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body.detail as string) || "Failed to capture excerpt");
  }
  return res.json() as Promise<{ ok: boolean; fact: Record<string, unknown> }>;
}

export async function fetchSourceContent(
  projectId: string, 
  url: string,
  mode: "text" | "markdown" | "html" | "auto" = "auto"
) {
  const params = new URLSearchParams({ url, mode });
  const res = await fetch(`${API_URL}/projects/${projectId}/sources/content?${params}`);
  if (!res.ok) {
    console.warn("Source content fetch failed or not implemented");
    return { 
      content: "", 
      format: "text" as const,
      text: null,
      markdown: null,
      html: null,
      title: null,
      url: url,
      domain: ""
    };
  }
  return res.json() as Promise<SourceContent>;
}

export async function deleteJob(projectId: string, jobId: string, deleteFacts: boolean = false) {
  const res = await fetch(`${API_URL}/projects/${projectId}/jobs/${jobId}?delete_facts=${deleteFacts}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete job");
  return res.json();
}

export async function resetProject(projectId: string) {
  const res = await fetch(`${API_URL}/projects/${projectId}/reset`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to reset project");
  return res.json();
}

// --- FACT MANAGEMENT ---

export async function updateFact(factId: string, updates: Partial<Fact>) {
  const res = await fetch(`${API_URL}/facts/${factId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to update fact");
  return res.json();
}

export async function deleteFact(factId: string) {
  const res = await fetch(`${API_URL}/facts/${factId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete fact");
  return res.json();
}

export async function batchUpdateFacts(factIds: string[], updates: Partial<Fact>) {
  const res = await fetch(`${API_URL}/facts/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fact_ids: factIds, updates }),
  });
  if (!res.ok) throw new Error("Batch update failed");
  return res.json();
}

// --- SYNTHESIS & AI ---

import { z } from "zod";

export async function updateJobSummary(jobId: string, summary: string) {
  const res = await fetch(`${API_URL}/jobs/${jobId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ summary }),
  });
  if (!res.ok) throw new Error("Failed to update summary");
  return res.json();
}

// ✅ STRICT SYNTHESIS CONTRACT: Canonical response schema
const SynthesisResponseSchema = z.object({
  synthesis: z.string().min(1),
  output_id: z.string().uuid(),
  clusters: z.array(z.unknown()).optional(),
});

const SynthesisErrorSchema = z.object({
  detail: z.union([z.string(), z.unknown()]),
  code: z.string().optional(),
});

export type SynthesisResponse = z.infer<typeof SynthesisResponseSchema>;
export type SynthesisError = z.infer<typeof SynthesisErrorSchema>;

// ✅ FIX: Only ONE definition of synthesizeFacts, correctly mapping data
interface LlmFactInput {
  id: string;
  text: string;
  title: string;
  url?: string;
  section?: string | null;
  review_status?: string | null;
  is_pinned?: boolean;
}

/** Input for synthesize/analyze: Fact or minimal shape with text/title/url/section (or fact_text/source_domain/etc.) */
export type SynthesizeFactInput = {
  id: string;
  text?: string;
  fact_text?: string;
  title?: string;
  source_domain?: string;
  url?: string;
  source_url?: string;
  section?: string | null;
  section_context?: string | null;
  review_status?: Fact["review_status"];
  is_pinned?: boolean;
};

export interface SynthesizeOptions {
  /** When true, backend returns 502 EMPTY_SYNTHESIS (E2E error test only) */
  forceError?: boolean;
}

export async function synthesizeFacts(
  projectId: string,
  facts: SynthesizeFactInput[],
  mode: "paragraph" | "research_brief" | "script_outline" | "split" = "paragraph",
  options?: SynthesizeOptions
): Promise<SynthesisResponse> {
  // Map frontend Fact / minimal shape -> Backend LlmFactInput
  const normalized: LlmFactInput[] = facts.map((f) => ({
    id: f.id,
    text: f.text ?? f.fact_text ?? "",
    title: f.title ?? f.source_domain ?? "Unknown",
    url: f.url ?? f.source_url ?? "",
    section: f.section ?? f.section_context ?? null,
    review_status: f.review_status ?? null,
    is_pinned: f.is_pinned ?? false,
  })).filter(f => f.id && f.text);

  const url = `${API_URL}/projects/${projectId}/synthesize`;
  
  // Build headers with E2E force-error support
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  
  // Check E2E flag for force-error (cleaner than query param or page.route)
  const isE2EMode = process.env.NEXT_PUBLIC_E2E_MODE === "true";
  if (isE2EMode && typeof window !== "undefined" && (window.__e2e as { _shouldForceNextSynthesisError?: () => boolean } | undefined)?._shouldForceNextSynthesisError?.()) {
    headers['x-e2e-force-error'] = 'true';
    console.log('🧪 E2E: Forcing next synthesis to error');
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ facts: normalized, mode }),
  });

  if (res.status === 502) {
    const err = await res.json().catch(() => ({}));
    const detail = typeof err?.detail === "string" ? err.detail : err?.detail;
    const msg = detail || "Backend is starting up, please wait a moment and try again.";
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown JSON error" }));
    const errorParse = SynthesisErrorSchema.safeParse(err);
    if (errorParse.success) {
      const detail = typeof errorParse.data.detail === "string"
        ? errorParse.data.detail
        : JSON.stringify(errorParse.data.detail);
      throw new Error(detail);
    }
    console.error("SERVER VALIDATION ERROR:", JSON.stringify(err, null, 2));
    throw new Error(err.detail ? JSON.stringify(err.detail) : "Synthesis failed");
  }

  const rawResponse = (await res.json()) as Record<string, unknown>;

  // Log response structure in dev mode
  if (process.env.NODE_ENV === "development") {
    console.log("SYNTHESIS_RAW_RESPONSE:", {
      keys: Object.keys(rawResponse),
      synthesis_type: typeof rawResponse.synthesis,
      output_id: rawResponse.output_id,
    });
  }

  // Validate canonical schema
  const validationResult = SynthesisResponseSchema.safeParse(rawResponse);

  if (validationResult.success) {
    const data = validationResult.data;
    if ((!data.synthesis || !data.synthesis.trim()) && data.output_id) {
      const full = await fetchOutput(data.output_id);
      if (!full.content?.trim()) throw new Error("LLM returned empty synthesis");
      return { synthesis: full.content, output_id: full.id, clusters: data.clusters };
    }
    return data;
  }

  // Enhanced multi-shape parsing
  const normalizedResponse = normalizeSynthesisResponse(rawResponse);

  if (normalizedResponse) {
    if ((!normalizedResponse.synthesis || !normalizedResponse.synthesis.trim()) && normalizedResponse.output_id) {
      const full = await fetchOutput(normalizedResponse.output_id);
      normalizedResponse.synthesis = full.content ?? '';
      if (!normalizedResponse.synthesis.trim()) throw new Error("LLM returned empty synthesis");
    } else if (!normalizedResponse.synthesis?.trim()) {
      throw new Error("LLM returned empty synthesis");
    }
    return normalizedResponse;
  }
  
  // If all parsing failed, throw with detailed error
  const responseKeys = rawResponse ? Object.keys(rawResponse).join(', ') : 'null';
  console.error('SYNTHESIS_PARSE_FAILURE:', {
    keys: responseKeys,
    validationErrors: validationResult.error?.issues,
    rawResponse,
  });
  
  throw new Error(
    `Invalid synthesis response - no synthesis text found. ` +
    `Response keys: ${responseKeys}. ` +
    `Validation errors: ${validationResult.error?.issues.map(e => e.message).join(', ')}`
  );
}

function getOutputId(r: Record<string, unknown>): string | undefined {
  const a = r.output_id ?? r.outputId;
  return typeof a === "string" ? a : undefined;
}

/**
 * ✅ STEP #13: Normalize synthesis response from multiple possible shapes
 * Handles backward compatibility and defensive parsing
 */
function normalizeSynthesisResponse(rawResponse: Record<string, unknown>): SynthesisResponse | null {
  let synthesisText: string | null = null;
  let outputId: string | undefined;

  // Shape A: { synthesis: string | string[], output_id: string } - CANONICAL
  if ("synthesis" in rawResponse) {
    const s = rawResponse.synthesis;
    if (typeof s === "string") synthesisText = s;
    else if (Array.isArray(s)) synthesisText = s.join("\n\n");
    outputId = getOutputId(rawResponse);
  }
  // Shape B: { synthesis: { synthesis: string }, output_id: string } - NESTED
  else if ("synthesis" in rawResponse && typeof rawResponse.synthesis === "object" && rawResponse.synthesis !== null) {
    const nested = (rawResponse.synthesis as Record<string, unknown>).synthesis;
    if (typeof nested === "string") synthesisText = nested;
    outputId = getOutputId(rawResponse);
  }
  // Shape C: { summary: string, output_id: string } - LEGACY
  else if ("summary" in rawResponse && typeof rawResponse.summary === "string") {
    synthesisText = rawResponse.summary;
    outputId = getOutputId(rawResponse);
  }
  // Shape D: { result: { synthesis: string | string[] } } - WRAPPED
  else if ("result" in rawResponse && rawResponse.result && typeof rawResponse.result === "object") {
    const innerResult = rawResponse.result as Record<string, unknown>;
    const s = innerResult.synthesis;
    if (typeof s === "string") synthesisText = s;
    else if (Array.isArray(s)) synthesisText = s.join("\n\n");
    outputId = getOutputId(rawResponse);
  }
  // Shape E: { text: string, output_id: string } - ALTERNATIVE
  else if ("text" in rawResponse && typeof rawResponse.text === "string") {
    synthesisText = rawResponse.text;
    outputId = getOutputId(rawResponse);
  }

  const clusters = Array.isArray(rawResponse.clusters) ? rawResponse.clusters : undefined;

  // If we have output_id but no synthesis, try fetching from /outputs/{id}
  if (!synthesisText && getOutputId(rawResponse)) {
    console.warn("⚠️ Synthesis text missing but output_id present. Will be handled by caller.");
    return {
      synthesis: "",
      output_id: getOutputId(rawResponse)!,
      clusters,
    };
  }

  if (synthesisText && outputId) {
    return { synthesis: synthesisText, output_id: outputId, clusters };
  }
  return null;
}

// --- OUTPUTS ---

export async function fetchProjectOutputsList(
  projectId: string,
  limit = 20,
  offset = 0,
  signal?: AbortSignal
): Promise<OutputSummary[]> {
  const url = `${API_URL}/projects/${projectId}/outputs?limit=${limit}&offset=${offset}`;
  const res = await fetch(url, { signal });
  if (res.status === 404) throw new Error("Project not found");
  if (!res.ok) throw new Error("Failed to fetch outputs");
  return res.json() as Promise<OutputSummary[]>;
}

export async function fetchProjectOutputs(projectId: string, signal?: AbortSignal): Promise<OutputSummary[]> {
  return fetchProjectOutputsList(projectId, 20, 0, signal);
}

/** Alias for fetchProjectOutputs (single function to fetch outputs list) */
export const listOutputs = fetchProjectOutputs;

export async function fetchOutput(outputId: string) {
  const res = await fetch(`${API_URL}/outputs/${outputId}`);
  if (!res.ok) throw new Error("Failed to fetch output");
  return res.json() as Promise<Output>;
}

export async function fetchOutputEvidenceMap(
  outputId: string,
  signal?: AbortSignal
): Promise<OutputEvidenceMapResponse> {
  const res = await fetch(`${API_URL}/outputs/${outputId}/evidence_map`, { signal });
  if (!res.ok) throw new Error("Failed to fetch output evidence map");
  return res.json();
}

export async function patchOutput(outputId: string, body: { is_pinned?: boolean }) {
  const res = await fetch(`${API_URL}/outputs/${outputId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to update output");
  return res.json() as Promise<Output>;
}

export async function deleteOutput(outputId: string) {
  const res = await fetch(`${API_URL}/outputs/${outputId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete output");
  return res.json();
}

export async function analyzeFacts(
  projectId: string,
  facts: SynthesizeFactInput[],
  signal?: AbortSignal
) {
  const normalized: LlmFactInput[] = facts.map((f) => ({
    id: f.id,
    text: f.text ?? f.fact_text ?? "",
    title: f.title ?? f.source_domain ?? "Unknown",
    url: f.url ?? f.source_url ?? "",
    section: f.section ?? f.section_context ?? null,
  })).filter(f => f.id && f.text);

  const res = await fetch(`${API_URL}/projects/${projectId}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ facts: normalized, mode: "paragraph" }),
    signal
  });
  
  // Handle 502 Gateway Error
  if (res.status === 502) {
    throw new Error("Backend is starting up, please wait a moment and try again.");
  }
  
  if (!res.ok) throw new Error("Analysis failed");
  const data = (await res.json()) as unknown;
  if (data && typeof data === "object" && "clusters" in data && Array.isArray((data as { clusters: unknown }).clusters)) {
    return data as { clusters: { label: string; fact_ids: string[] }[] };
  }
  return { clusters: [] };
}

// --- EXPORT ---

export type ExportFormat = "markdown" | "json" | "csv" | "csv_evidence" | "markdown_evidence";

export interface ExportResult {
  filename: string;
  content: string;
  mimeType: string;
}

export async function exportProject(
  projectId: string,
  format: ExportFormat,
  signal?: AbortSignal
): Promise<ExportResult> {
  const res = await fetch(
    `${API_URL}/projects/${projectId}/export?format=${format}`,
    { signal }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Export failed");
  }
  const text = await res.text();
  const mimeType = res.headers.get("content-type") || (format === "json" ? "application/json" : format === "csv" ? "text/csv" : "text/markdown");
  const ext = format === "json" ? "json" : format === "csv" || format === "csv_evidence" ? "csv" : "md";
  const filename = `project-${projectId}-${format}.${ext}`;
  return { filename, content: text, mimeType };
}

export async function downloadAsCSV(facts: Fact[], filename: string) {
  const headers = ["Source", "Fact", "Confidence", "Key Claim", "Tags"];
  const rows = facts.map(f => [
    `"${f.source_domain}"`,
    `"${f.fact_text.replace(/"/g, '""')}"`,
    f.confidence_score,
    f.is_key_claim ? "Yes" : "No",
    `"${(f.tags || []).join(",")}"`
  ]);

  const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
}

export async function downloadAsMarkdown(facts: Fact[], filename: string) {
  const content = facts.map(f => `
### ${f.source_domain}
> ${f.fact_text}
*Confidence: ${f.confidence_score}/100 | Key Claim: ${f.is_key_claim ? "Yes" : "No"}*
`).join("\n");

  const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.md`;
  link.click();
}
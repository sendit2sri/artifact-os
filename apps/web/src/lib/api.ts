const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

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
  quote_text_raw?: string;
  // Evidence offset anchors for precise highlighting
  evidence_start_char_raw?: number;
  evidence_end_char_raw?: number;
  evidence_start_char_md?: number;
  evidence_end_char_md?: number;
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
  };
  result_summary?: {
    source_title?: string;
    facts_count?: number;
    summary?: string | string[];
  };
  current_step?: string;
  error_message?: string;
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
  created_at: string;
  updated_at: string;
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

export async function fetchProject(id: string) {
  const res = await fetch(`${API_URL}/projects/${id}`);
  if (!res.ok) throw new Error("Failed to fetch project");
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
  filter?: "all" | "needs_review" | "key_claims" | "approved" | "flagged" | "rejected";
  sort?: "newest" | "confidence" | "key_claims";
  order?: "asc" | "desc";
}

export async function fetchProjectFacts(projectId: string, filters?: FactsFilter) {
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
  
  const url = `${API_URL}/projects/${projectId}/facts${params.toString() ? `?${params.toString()}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch facts");
  return res.json() as Promise<Fact[]>;
}

export async function fetchProjectJobs(projectId: string) {
  const res = await fetch(`${API_URL}/projects/${projectId}/jobs`);
  if (!res.ok) throw new Error("Failed to fetch jobs");
  return res.json() as Promise<Job[]>;
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
  clusters: z.array(z.any()).optional(),
});

const SynthesisErrorSchema = z.object({
  detail: z.union([z.string(), z.any()]),
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
}

export interface SynthesizeOptions {
  /** When true, backend returns 502 EMPTY_SYNTHESIS (E2E error test only) */
  forceError?: boolean;
}

export async function synthesizeFacts(
  projectId: string,
  facts: any[],
  mode: "paragraph" | "outline" | "brief" = "paragraph",
  options?: SynthesizeOptions
): Promise<SynthesisResponse> {
  // Map frontend 'Fact' -> Backend 'FactInput'
  const normalized: LlmFactInput[] = facts.map((f) => ({
    id: f.id,
    text: f.text ?? f.fact_text ?? "",
    title: f.title ?? f.source_domain ?? "Unknown",
    url: f.url ?? f.source_url ?? "",
    section: f.section ?? f.section_context ?? null,
  })).filter(f => f.id && f.text);

  // ✅ FIX: Don't use new URL() with relative path (throws Invalid URL in browser)
  const baseUrl = `${API_URL}/projects/${projectId}/synthesize`;
  const url = options?.forceError ? `${baseUrl}?force_error=true` : baseUrl;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

  const rawResponse = await res.json();
  
  // Log response structure in dev mode
  if (process.env.NODE_ENV === 'development') {
    console.log('SYNTHESIS_RAW_RESPONSE:', {
      keys: Object.keys(rawResponse),
      synthesis_type: typeof rawResponse.synthesis,
      output_id: rawResponse.output_id,
    });
  }
  
  // Validate canonical schema
  const validationResult = SynthesisResponseSchema.safeParse(rawResponse);
  
  if (validationResult.success) {
    return validationResult.data;
  }
  
  // ✅ STEP #13: Enhanced multi-shape parsing with better normalization
  const normalizedResponse = normalizeSynthesisResponse(rawResponse);
  
  if (normalizedResponse) {
    // ✅ Check for empty synthesis
    if (!normalizedResponse.synthesis || !normalizedResponse.synthesis.trim()) {
      throw new Error("LLM returned empty synthesis");
    }
    return normalizedResponse;
  }
  
  // If all parsing failed, throw with detailed error
  const responseKeys = rawResponse ? Object.keys(rawResponse).join(', ') : 'null';
  console.error('SYNTHESIS_PARSE_FAILURE:', {
    keys: responseKeys,
    validationErrors: validationResult.error?.errors,
    rawResponse,
  });
  
  throw new Error(
    `Invalid synthesis response - no synthesis text found. ` +
    `Response keys: ${responseKeys}. ` +
    `Validation errors: ${validationResult.error?.errors.map(e => e.message).join(', ')}`
  );
}

/**
 * ✅ STEP #13: Normalize synthesis response from multiple possible shapes
 * Handles backward compatibility and defensive parsing
 */
function normalizeSynthesisResponse(rawResponse: any): SynthesisResponse | null {
  let synthesisText: string | null = null;
  let outputId: string | undefined;
  
  // Shape A: { synthesis: string | string[], output_id: string } - CANONICAL
  if ('synthesis' in rawResponse) {
    if (typeof rawResponse.synthesis === 'string') {
      synthesisText = rawResponse.synthesis;
    } else if (Array.isArray(rawResponse.synthesis)) {
      synthesisText = rawResponse.synthesis.join('\n\n');
    }
    outputId = rawResponse.output_id || rawResponse.outputId;
  }
  // Shape B: { synthesis: { synthesis: string }, output_id: string } - NESTED
  else if ('synthesis' in rawResponse && typeof rawResponse.synthesis === 'object' && rawResponse.synthesis.synthesis) {
    synthesisText = rawResponse.synthesis.synthesis;
    outputId = rawResponse.output_id || rawResponse.outputId;
  }
  // Shape C: { summary: string, output_id: string } - LEGACY
  else if ('summary' in rawResponse && typeof rawResponse.summary === 'string') {
    synthesisText = rawResponse.summary;
    outputId = rawResponse.output_id || rawResponse.outputId;
  }
  // Shape D: { result: { synthesis: string | string[] } } - WRAPPED
  else if ('result' in rawResponse && rawResponse.result) {
    const innerResult = rawResponse.result;
    if (typeof innerResult.synthesis === 'string') {
      synthesisText = innerResult.synthesis;
    } else if (Array.isArray(innerResult.synthesis)) {
      synthesisText = innerResult.synthesis.join('\n\n');
    }
    outputId = rawResponse.output_id || rawResponse.outputId;
  }
  // Shape E: { text: string, output_id: string } - ALTERNATIVE
  else if ('text' in rawResponse && typeof rawResponse.text === 'string') {
    synthesisText = rawResponse.text;
    outputId = rawResponse.output_id || rawResponse.outputId;
  }
  
  // If we have output_id but no synthesis, try fetching from /outputs/{id}
  if (!synthesisText && (rawResponse.output_id || rawResponse.outputId)) {
    console.warn('⚠️ Synthesis text missing but output_id present. Will be handled by caller.');
    // Return partial result - caller can fetch from /outputs endpoint
    return {
      synthesis: '', // Empty but valid
      output_id: rawResponse.output_id || rawResponse.outputId,
      clusters: rawResponse.clusters
    };
  }
  
  // Final validation
  if (synthesisText && outputId) {
    return {
      synthesis: synthesisText,
      output_id: outputId,
      clusters: rawResponse.clusters,
    };
  }
  
  return null;
}

// --- OUTPUTS ---

export async function fetchProjectOutputs(projectId: string) {
  const res = await fetch(`${API_URL}/projects/${projectId}/outputs`);
  if (!res.ok) throw new Error("Failed to fetch outputs");
  return res.json() as Promise<Output[]>;
}

export async function fetchOutput(outputId: string) {
  const res = await fetch(`${API_URL}/outputs/${outputId}`);
  if (!res.ok) throw new Error("Failed to fetch output");
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
  facts: any[],
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
  return res.json() as Promise<{ clusters: { label: string; fact_ids: string[] }[] }>;
}

// --- EXPORT ---

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
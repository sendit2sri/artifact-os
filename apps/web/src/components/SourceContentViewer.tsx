"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { fetchSourceContent, SourceContent } from "@/lib/api";

export interface SourceContentViewerProps {
  projectId: string;
  url: string;
  format: "raw" | "markdown" | "auto";
  evidenceStartRaw?: number | null;
  evidenceEndRaw?: number | null;
  evidenceStartMd?: number | null;
  evidenceEndMd?: number | null;
  evidenceSnippet?: string | null;
  /** When true, content is selectable for capture. Call getSelectionRange() to get offsets. */
  selectable?: boolean;
  contentRef?: React.RefObject<HTMLDivElement | null>;
}

/**
 * Deterministic text-level highlight: split into 3 parts and wrap middle with <mark>.
 * Uses raw or markdown offsets depending on which format we're displaying.
 */
function renderWithHighlight(
  content: string,
  start: number,
  end: number,
  selectable: boolean
) {
  if (start < 0 || end <= start || end > content.length) {
    return content;
  }
  const before = content.slice(0, start);
  const highlight = content.slice(start, end);
  const after = content.slice(end);
  return (
    <>
      {before}
      <mark data-testid="source-highlight" className="bg-primary/20 rounded px-0.5">
        {highlight}
      </mark>
      {after}
    </>
  );
}

export function SourceContentViewer({
  projectId,
  url,
  format,
  evidenceStartRaw,
  evidenceEndRaw,
  evidenceStartMd,
  evidenceEndMd,
  evidenceSnippet,
  selectable = false,
  contentRef: externalContentRef,
}: SourceContentViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SourceContent | null>(null);
  const internalRef = useRef<HTMLDivElement>(null);
  const contentRef = externalContentRef ?? internalRef;

  useEffect(() => {
    if (!url || !projectId) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const mode = format === "raw" ? "text" : format === "markdown" ? "markdown" : "auto";
    fetchSourceContent(projectId, url, mode)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError(res.content ? null : "No content");
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load source");
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, url, format]);

  const content = data?.content ?? "";
  const isRaw = (data?.format ?? "text") === "text";
  const start = isRaw
    ? (evidenceStartRaw ?? evidenceStartMd ?? -1)
    : (evidenceStartMd ?? evidenceStartRaw ?? -1);
  const end = isRaw
    ? (evidenceEndRaw ?? evidenceEndMd ?? -1)
    : (evidenceEndMd ?? evidenceEndRaw ?? -1);
  const hasOffsets = start >= 0 && end > start && end <= content.length;
  const hasSnippetOnly = Boolean(evidenceSnippet?.trim()) && !hasOffsets;

  if (loading) {
    return (
      <div data-testid="source-content-loading" className="text-sm text-muted-foreground py-4">
        Loading source...
      </div>
    );
  }
  if (error) {
    return (
      <div data-testid="source-content-error" className="text-sm text-destructive py-4">
        {error}
      </div>
    );
  }
  if (!content) {
    return (
      <div data-testid="source-content-error" className="text-sm text-muted-foreground py-4">
        No content available for this source.
      </div>
    );
  }

  const body = hasOffsets
    ? renderWithHighlight(content, start, end, selectable)
    : content;

  return (
    <div className="space-y-2">
      {hasSnippetOnly && (
        <p className="text-[11px] text-muted-foreground" data-testid="evidence-no-highlight-helper">
          Captured excerpt (no highlight positions)
        </p>
      )}
      <div
        ref={contentRef}
        data-testid="source-content-viewer"
        className="text-sm text-foreground whitespace-pre-wrap break-words border border-border rounded-lg p-3 max-h-[280px] overflow-y-auto bg-muted/30 select-text"
      >
        {body}
      </div>
    </div>
  );
}

/**
 * Get selected range as { start, end } character offsets, or null if no valid selection.
 */
export function getSelectionRange(containerEl: HTMLDivElement | null): { start: number; end: number } | null {
  if (!containerEl) return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!containerEl.contains(range.startContainer) || !containerEl.contains(range.endContainer)) {
    return null;
  }
  const pre = document.createRange();
  pre.setStart(containerEl, 0);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  const end = start + range.toString().length;
  if (start >= end) return null;
  return { start, end };
}

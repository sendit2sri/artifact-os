"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Pin, PinOff, RefreshCw, Copy, CheckCircle2, AlertCircle, Flag, X, BookOpen } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Fact } from "@/lib/api";
import { cn } from "@/lib/utils";
import { fetchFactEvidence, ingestUrl, captureExcerpt, EvidenceResponse } from "@/lib/api";
import { SourceContentViewer, getSelectionRange } from "@/components/SourceContentViewer";
import { toast } from "sonner";

type ReviewStatus = Fact["review_status"];

interface EvidencePanelSimpleProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fact: Fact | null;
  visibleFacts: Fact[];
  projectId: string;
  workspaceId: string;
  onPrev: () => void;
  onNext: () => void;
  pinned?: boolean;
  onPinChange?: (pinned: boolean) => void;
  onReviewStatusChange?: (factId: string, status: ReviewStatus) => void;
  onFactUpdate?: (factId: string, updates: Partial<Fact>) => void;
  autoAdvance?: boolean;
  onAutoAdvanceChange?: (enabled: boolean) => void;
  /** Review Queue mode: nav through queueIds instead of visibleFacts */
  queueIds?: string[];
  queueMode?: boolean;
  onQueueExit?: () => void;
}

export function EvidencePanelSimple({
  open,
  onOpenChange,
  fact,
  visibleFacts,
  projectId,
  workspaceId,
  onPrev,
  onNext,
  pinned = false,
  onPinChange,
  onReviewStatusChange,
  onFactUpdate,
  autoAdvance = true,
  onAutoAdvanceChange,
  queueIds = [],
  queueMode = false,
  onQueueExit,
}: EvidencePanelSimpleProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<EvidenceResponse | null>(null);
  const cacheKey = (fId: string) => `${projectId}:${fId}`;
  const cacheRef = useRef<Map<string, EvidenceResponse>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const lastRequestedFactIdRef = useRef<string | null>(null);
  const prevProjectIdRef = useRef<string>("");
  const sourceContentRef = useRef<HTMLDivElement | null>(null);
  if (prevProjectIdRef.current !== projectId) {
    cacheRef.current.clear();
    prevProjectIdRef.current = projectId;
  }

  const fetchEvidence = useCallback(async (factId: string, isRetry = false) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    lastRequestedFactIdRef.current = factId;

    const key = cacheKey(factId);
    const cached = cacheRef.current.get(key);
    if (cached && !isRetry) {
      setEvidence(cached);
      setError(null);
      setLoading(false);
      return;
    }

    setError(null);
    setLoading(true);
    setEvidence(null);

    try {
      const result = await fetchFactEvidence(projectId, factId, abortRef.current.signal);
      if (lastRequestedFactIdRef.current !== factId) return;
      cacheRef.current.set(key, result);
      setEvidence(result);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      if (lastRequestedFactIdRef.current !== factId) return;
      setError(e instanceof Error ? e.message : "Failed to fetch evidence");
    } finally {
      if (lastRequestedFactIdRef.current === factId) {
        setLoading(false);
      }
      abortRef.current = null;
    }
  }, [projectId]);

  useEffect(() => {
    if (!fact) {
      setEvidence(null);
      setError(null);
      setLoading(false);
      lastRequestedFactIdRef.current = null;
      return;
    }
    fetchEvidence(fact.id);
    return () => abortRef.current?.abort();
  }, [fact?.id, fetchEvidence]);

  // Prefetch next/prev evidence (max 2, abortable) for snappier nav
  const prefetchAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!open || !fact || visibleFacts.length === 0) return;
    const navList = queueMode && queueIds.length ? queueIds : visibleFacts.map((f) => f.id);
    const idx = navList.indexOf(fact.id);
    const toPrefetch: string[] = [];
    if (idx > 0) toPrefetch.push(navList[idx - 1]);
    if (idx >= 0 && idx < navList.length - 1) toPrefetch.push(navList[idx + 1]);
    const uncached = toPrefetch.slice(0, 2).filter((id) => !cacheRef.current.has(cacheKey(id)));
    if (uncached.length === 0) return;
    prefetchAbortRef.current?.abort();
    prefetchAbortRef.current = new AbortController();
    const ctrl = prefetchAbortRef.current;
    uncached.forEach((factId) => {
      fetchFactEvidence(projectId, factId, ctrl.signal)
        .then((res) => {
          if (!ctrl.signal.aborted) cacheRef.current.set(cacheKey(factId), res);
        })
        .catch(() => {});
    });
    return () => {
      prefetchAbortRef.current?.abort();
      prefetchAbortRef.current = null;
    };
  }, [open, fact?.id, projectId, visibleFacts, queueMode, queueIds]);

  const handleRetry = () => {
    if (fact) fetchEvidence(fact.id, true);
  };

  const [reprocessing, setReprocessing] = useState(false);
  const handleReprocessSource = useCallback(async () => {
    const url = evidence?.sources?.[0]?.url;
    if (!url || !projectId || !workspaceId) return;
    setReprocessing(true);
    try {
      await ingestUrl(projectId, workspaceId, url);
      toast.success("Reprocessing started. Facts will update when the job completes.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start reprocessing");
    } finally {
      setReprocessing(false);
    }
  }, [projectId, workspaceId, evidence?.sources]);

  const navList = queueMode && queueIds.length ? queueIds : visibleFacts.map((f) => f.id);
  const index = fact ? navList.indexOf(fact.id) : -1;
  const canPrev = index > 0;
  const canNext = index >= 0 && index < navList.length - 1;
  const queueRemaining = queueMode && index >= 0 ? navList.length - index : 0;

  const primarySource = evidence?.sources?.[0];
  const hasSnippet = Boolean(evidence?.evidence_snippet?.trim());
  const copyText = hasSnippet ? (evidence!.evidence_snippet ?? "").trim() : (evidence?.fact_text ?? "");

  const handleCopySnippet = () => {
    const text = copyText || evidence?.fact_text || "";
    if (text) {
      navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    }
  };

  const handleReview = (status: ReviewStatus) => {
    if (!fact || !onReviewStatusChange) return;
    onReviewStatusChange(fact.id, status);
    if (autoAdvance && canNext) onNext();
  };

  useEffect(() => {
    if (!open || !queueMode || !fact || !onReviewStatusChange) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input") || target.closest("textarea")) return;
      const key = e.key.toLowerCase();
      if (key === "a") { e.preventDefault(); handleReview("APPROVED"); return; }
      if (key === "n") { e.preventDefault(); handleReview("NEEDS_REVIEW"); return; }
      if (key === "f") { e.preventDefault(); handleReview("FLAGGED"); return; }
      if (key === "r") { e.preventDefault(); handleReview("REJECTED"); return; }
      if (key === "j") { e.preventDefault(); if (canNext) onNext(); return; }
      if (key === "k") { e.preventDefault(); if (canPrev) onPrev(); return; }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, queueMode, fact?.id, canPrev, canNext, onPrev, onNext, onReviewStatusChange]);

  const [showCaptureUI, setShowCaptureUI] = useState(false);
  const [captureFormat, setCaptureFormat] = useState<"raw" | "markdown">("raw");
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureStart, setCaptureStart] = useState("");
  const [captureEnd, setCaptureEnd] = useState("");

  const handleCaptureExcerpt = useCallback(async () => {
    if (!fact || !primarySource?.url || !projectId) return;
    setCaptureError(null);
    const url = primarySource.url;
    let start: number;
    let end: number;
    const selRange = getSelectionRange(sourceContentRef.current);
    if (selRange) {
      start = selRange.start;
      end = selRange.end;
    } else {
      const s = parseInt(captureStart, 10);
      const e = parseInt(captureEnd, 10);
      if (isNaN(s) || isNaN(e) || s >= e) {
        setCaptureError("Enter valid start and end (start < end)");
        return;
      }
      start = s;
      end = e;
    }
    setCapturing(true);
    try {
      const res = await captureExcerpt(projectId, fact.id, {
        source_url: url,
        format: captureFormat,
        start,
        end,
      });
      cacheRef.current.set(`${projectId}:${fact.id}`, {
        ...evidence!,
        evidence_snippet: (res.fact.evidence_snippet as string) ?? evidence!.evidence_snippet,
        evidence_start_char_raw: (res.fact.evidence_start_char_raw as number) ?? evidence!.evidence_start_char_raw,
        evidence_end_char_raw: (res.fact.evidence_end_char_raw as number) ?? evidence!.evidence_end_char_raw,
        evidence_start_char_md: (res.fact.evidence_start_char_md as number) ?? evidence!.evidence_start_char_md,
        evidence_end_char_md: (res.fact.evidence_end_char_md as number) ?? evidence!.evidence_end_char_md,
      });
      setEvidence((prev) =>
        prev
          ? {
              ...prev,
              evidence_snippet: (res.fact.evidence_snippet as string) ?? prev.evidence_snippet,
              evidence_start_char_raw: (res.fact.evidence_start_char_raw as number) ?? prev.evidence_start_char_raw,
              evidence_end_char_raw: (res.fact.evidence_end_char_raw as number) ?? prev.evidence_end_char_raw,
              evidence_start_char_md: (res.fact.evidence_start_char_md as number) ?? prev.evidence_start_char_md,
              evidence_end_char_md: (res.fact.evidence_end_char_md as number) ?? prev.evidence_end_char_md,
            }
          : prev
      );
      onFactUpdate?.(fact.id, {
        evidence_snippet: res.fact.evidence_snippet as string,
        evidence_start_char_raw: res.fact.evidence_start_char_raw as number,
        evidence_end_char_raw: res.fact.evidence_end_char_raw as number,
        evidence_start_char_md: res.fact.evidence_start_char_md as number,
        evidence_end_char_md: res.fact.evidence_end_char_md as number,
      });
      setShowCaptureUI(false);
      setCaptureStart("");
      setCaptureEnd("");
      toast.success("Excerpt captured");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to capture excerpt";
      setCaptureError(msg);
    } finally {
      setCapturing(false);
    }
  }, [fact, primarySource?.url, projectId, captureFormat, captureStart, captureEnd, evidence, onFactUpdate]);

  const openCaptureUI = () => {
    setShowCaptureUI(true);
    setCaptureError(null);
    setCaptureStart("");
    setCaptureEnd("");
  };

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen && queueMode) onQueueExit?.();
    onOpenChange(nextOpen);
  }, [queueMode, onQueueExit, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange} modal={false}>
      <SheetContent
        data-testid="evidence-panel"
        side="right"
        nonModal
        className="w-[400px] sm:w-[480px] flex flex-col p-0"
        closeButtonTestId="evidence-close"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Fact evidence</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col h-full">
          <div className={cn("flex items-center justify-between pl-4 pr-14 py-3 border-b border-border shrink-0", queueMode && "flex-col items-stretch gap-2")}>
            {queueMode && (
              <div data-testid="review-queue-mode" className="flex items-center justify-between">
                <span data-testid="review-queue-remaining" className="text-xs font-medium text-muted-foreground">
                  Queue: {queueRemaining} remaining
                </span>
                {onQueueExit && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onQueueExit()}>
                    Exit queue
                  </Button>
                )}
              </div>
            )}
            <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                data-testid="evidence-prev"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={!canPrev}
                onClick={onPrev}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                data-testid="evidence-next"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={!canNext}
                onClick={onNext}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            {onPinChange && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      data-testid="evidence-pin"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => onPinChange(!pinned)}
                    >
                      {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{pinned ? "Unpin panel" : "Pin panel"}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            </div>
          </div>

          {queueMode && (
            <div data-testid="review-queue-hotkeys" className="px-4 py-1.5 border-b border-border shrink-0 text-[11px] text-muted-foreground">
              A Approve · N Needs review · F Flag · R Reject · J/K Nav
            </div>
          )}

          {fact && onReviewStatusChange && (
            <div data-testid="evidence-review-bar" className="flex items-center gap-1 px-4 py-2 border-b border-border shrink-0 flex-wrap">
              <Button
                data-testid="evidence-review-approve"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-success hover:bg-success/10"
                onClick={() => handleReview("APPROVED")}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Approve
              </Button>
              <Button
                data-testid="evidence-review-needs_review"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-warning hover:bg-warning/10"
                onClick={() => handleReview("NEEDS_REVIEW")}
              >
                <AlertCircle className="w-3.5 h-3.5 mr-1" />
                Needs Review
              </Button>
              <Button
                data-testid="evidence-review-flag"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-destructive hover:bg-destructive/10"
                onClick={() => handleReview("FLAGGED")}
              >
                <Flag className="w-3.5 h-3.5 mr-1" />
                Flag
              </Button>
              <Button
                data-testid="evidence-review-reject"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:bg-muted"
                onClick={() => handleReview("REJECTED")}
              >
                <X className="w-3.5 h-3.5 mr-1" />
                Reject
              </Button>
              {onAutoAdvanceChange && (
                <label className="flex items-center gap-2 ml-2 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="evidence-auto-advance-toggle"
                    checked={autoAdvance}
                    onChange={(e) => onAutoAdvanceChange(e.target.checked)}
                    className="rounded border-border"
                  />
                  Auto-advance
                </label>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4">
            {!fact ? (
              <div data-testid="evidence-empty" className="text-sm text-muted-foreground py-8 text-center">
                No fact selected. Click a fact to view evidence.
              </div>
            ) : error ? (
              <div
                data-testid="evidence-error"
                className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
              >
                <p>{error}</p>
                <Button
                  data-testid="evidence-retry"
                  variant="outline"
                  size="sm"
                  className="mt-3 border-destructive/50 text-destructive hover:bg-destructive/10"
                  onClick={handleRetry}
                >
                  Retry
                </Button>
              </div>
            ) : loading ? (
              <div data-testid="evidence-loading" className="flex items-center gap-2 text-sm text-muted-foreground py-8">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading evidence...
              </div>
            ) : evidence ? (
              <div className="space-y-4" data-testid="evidence-panel-content">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Fact</p>
                  <p
                    data-testid="evidence-fact-text"
                    className="text-sm text-foreground leading-relaxed"
                  >
                    {evidence.fact_text}
                  </p>
                </div>
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground">Evidence</p>
                  <p data-testid="evidence-freshness" className="text-[11px] text-muted-foreground">
                    {hasSnippet
                      ? "Excerpt captured during ingestion"
                      : "No excerpt captured yet — try reprocessing source"}
                  </p>
                  {evidence.evidence_snippet ? (
                    <p
                      data-testid="evidence-snippet"
                      className="text-sm text-foreground leading-relaxed"
                    >
                      {evidence.evidence_snippet}
                    </p>
                  ) : (
                    <p data-testid="evidence-empty-snippet" className="text-sm text-muted-foreground italic">
                      No excerpt captured yet
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Button
                      data-testid="evidence-copy-snippet"
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={handleCopySnippet}
                      disabled={!copyText}
                    >
                      <Copy className="w-3 h-3 mr-1.5" />
                      Copy evidence
                    </Button>
                    {primarySource?.url && (
                      <Button
                        data-testid="evidence-capture-excerpt"
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={openCaptureUI}
                      >
                        <BookOpen className="w-3 h-3 mr-1.5" />
                        Capture excerpt
                      </Button>
                    )}
                    {!hasSnippet && primarySource?.url && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        data-testid="evidence-reprocess-source"
                        onClick={handleReprocessSource}
                        disabled={reprocessing}
                      >
                        {reprocessing ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1.5" />}
                        Reprocess Source
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-2 pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground">Source</p>
                  {primarySource && (
                    <>
                      <p data-testid="evidence-source-domain" className="text-sm font-medium text-foreground">
                        {primarySource.domain}
                      </p>
                      {primarySource.url && (
                        <>
                          <a
                            data-testid="evidence-source-url"
                            href={primarySource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            {primarySource.url}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <Button
                            data-testid="evidence-open-primary"
                            variant="outline"
                            size="sm"
                            className="mt-1 text-xs"
                            asChild
                          >
                            <a href={primarySource.url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-3 h-3 mr-1.5" />
                              {primarySource.source_type === "REDDIT"
                                ? "Open permalink"
                                : primarySource.source_type === "YOUTUBE"
                                  ? "Open video"
                                  : "Open source"}
                            </a>
                          </Button>
                        </>
                      )}
                      {primarySource.excerpt && !showCaptureUI && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                          {primarySource.excerpt}
                        </p>
                      )}
                      <div className="mt-2">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Source content</p>
                        <SourceContentViewer
                          projectId={projectId}
                          url={primarySource.url}
                          format={showCaptureUI ? captureFormat : "auto"}
                          evidenceStartRaw={evidence.evidence_start_char_raw}
                          evidenceEndRaw={evidence.evidence_end_char_raw}
                          evidenceStartMd={evidence.evidence_start_char_md}
                          evidenceEndMd={evidence.evidence_end_char_md}
                          evidenceSnippet={evidence.evidence_snippet}
                          contentRef={sourceContentRef}
                        />
                      </div>
                      {showCaptureUI && (
                        <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/30 p-3" data-testid="evidence-capture-ui">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Format:</span>
                            <Button
                              variant={captureFormat === "raw" ? "secondary" : "ghost"}
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setCaptureFormat("raw")}
                            >
                              Raw
                            </Button>
                            <Button
                              variant={captureFormat === "markdown" ? "secondary" : "ghost"}
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setCaptureFormat("markdown")}
                            >
                              Markdown
                            </Button>
                          </div>
                          <div className="flex gap-2 items-center">
                            <input
                              type="number"
                              placeholder="Start"
                              className="w-20 h-8 text-xs rounded border border-input bg-background px-2"
                              value={captureStart}
                              onChange={(e) => setCaptureStart(e.target.value)}
                            />
                            <input
                              type="number"
                              placeholder="End"
                              className="w-20 h-8 text-xs rounded border border-input bg-background px-2"
                              value={captureEnd}
                              onChange={(e) => setCaptureEnd(e.target.value)}
                            />
                            <span className="text-[11px] text-muted-foreground">or select text above</span>
                          </div>
                          {captureError && (
                            <p data-testid="evidence-capture-error" className="text-xs text-destructive">
                              {captureError}
                            </p>
                          )}
                          <div className="flex gap-2">
                            <Button
                              data-testid="evidence-capture-save"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={handleCaptureExcerpt}
                              disabled={capturing}
                            >
                              {capturing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                              Capture selection
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                setShowCaptureUI(false);
                                setCaptureError(null);
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

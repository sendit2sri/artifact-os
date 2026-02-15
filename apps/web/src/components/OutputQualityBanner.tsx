"use client";

import { Output, QualityStats } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, RefreshCw, ListChecks, SlidersHorizontal } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function hasIssues(q: QualityStats | null | undefined): boolean {
  if (!q) return false;
  return (q.needs_review ?? 0) + (q.flagged ?? 0) + (q.rejected ?? 0) > 0;
}

function approvedCount(q: QualityStats | null | undefined): number {
  return q?.approved ?? 0;
}

export interface OutputQualityBannerProps {
  output: Output;
  onReviewIssues?: () => void;
  onRegenerateApprovedOnly?: () => void;
  onOpenRepick?: () => void;
  mode?: "project" | "share";
  isRegenerating?: boolean;
}

export function OutputQualityBanner({
  output,
  onReviewIssues,
  onRegenerateApprovedOnly,
  onOpenRepick,
  mode = "project",
  isRegenerating = false,
}: OutputQualityBannerProps) {
  const q = output.quality_stats;
  const issuesPresent = hasIssues(q);
  const approved = approvedCount(q);
  const canRegenerateApprovedOnly = approved >= 2;

  if (!issuesPresent) {
    return (
      <div data-testid="output-quality-banner" className="flex items-center gap-2 text-xs text-muted-foreground py-1">
        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
        <span>High trust — all facts used are approved.</span>
      </div>
    );
  }

  if (mode === "share") {
    return (
      <div
        data-testid="output-page-quality-banner"
        className="rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-foreground"
      >
        <div className="flex items-center gap-2 font-medium text-warning mb-1">
          <AlertCircle className="w-4 h-4 shrink-0" />
          This output used non-approved facts
        </div>
        <div data-testid="output-quality-breakdown" className="text-xs text-muted-foreground">
          {q && (
            <>
              {q.approved} approved · {q.needs_review} needs review · {q.flagged} flagged
              {q.rejected > 0 && ` · ${q.rejected} rejected`}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="output-quality-banner"
      className="rounded-lg border border-warning/50 bg-warning/10 px-4 py-3 text-sm"
    >
      <div className="flex items-center gap-2 font-medium text-warning mb-2">
        <AlertCircle className="w-4 h-4 shrink-0" />
        Quality issues — some facts used are not approved
      </div>
      <div data-testid="output-quality-breakdown" className="text-xs text-muted-foreground mb-3">
        {q && (
          <>
            {q.approved} approved · {q.needs_review} needs review · {q.flagged} flagged
            {q.rejected > 0 && ` · ${q.rejected} rejected`}
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {onReviewIssues && (
          <Button
            data-testid="output-quality-review-issues"
            variant="outline"
            size="sm"
            className="h-8 text-xs border-warning/50 text-warning hover:bg-warning/10"
            onClick={onReviewIssues}
          >
            <ListChecks className="w-3 h-3 mr-1.5" />
            Review issues
          </Button>
        )}
        {onRegenerateApprovedOnly && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    data-testid="output-quality-regenerate-approved"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs border-warning/50 text-warning hover:bg-warning/10"
                    onClick={canRegenerateApprovedOnly ? onRegenerateApprovedOnly : undefined}
                    disabled={!canRegenerateApprovedOnly || isRegenerating}
                  >
                    {isRegenerating ? null : <RefreshCw className="w-3 h-3 mr-1.5" />}
                    Regenerate from approved only
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {!canRegenerateApprovedOnly && (
                  <span data-testid="output-quality-regenerate-disabled">
                    Need at least 2 approved facts to regenerate
                  </span>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {onOpenRepick && (
          <Button
            data-testid="output-quality-repick"
            variant="outline"
            size="sm"
            className="h-8 text-xs border-warning/50 text-warning hover:bg-warning/10"
            onClick={onOpenRepick}
          >
            <SlidersHorizontal className="w-3 h-3 mr-1.5" />
            Pin & regenerate
          </Button>
        )}
      </div>
      {!canRegenerateApprovedOnly && onRegenerateApprovedOnly && (
        <p data-testid="output-quality-regenerate-disabled" className="text-[11px] text-muted-foreground mt-2">
          Need at least 2 approved facts to regenerate
        </p>
      )}
    </div>
  );
}

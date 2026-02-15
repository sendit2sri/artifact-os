"use client";

import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink } from "lucide-react";
import { fetchSourcesSummary, SourceSummary } from "@/lib/api";

interface SourceHealthPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onOpenSource: (url: string) => void;
}

export function SourceHealthPanel({
  open,
  onOpenChange,
  projectId,
  onOpenSource,
}: SourceHealthPanelProps) {
  const { data: sources, isLoading } = useQuery({
    queryKey: ["sources-summary", projectId],
    queryFn: () => fetchSourcesSummary(projectId),
    enabled: open,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        data-testid="source-health-panel"
        side="right"
        nonModal
        className="w-[400px] sm:w-[480px] flex flex-col p-0"
        closeButtonTestId="source-health-close"
      >
        <SheetHeader className="px-6 py-4 border-b border-border shrink-0">
          <SheetTitle>Source Health</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div data-testid="source-health-loading" className="flex items-center gap-2 text-sm text-muted-foreground py-8">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          ) : !sources?.length ? (
            <p data-testid="source-health-empty" className="text-sm text-muted-foreground py-8">
              No sources yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {sources.map((s) => (
                <li
                  key={s.source_url}
                  className="rounded-lg border border-border bg-surface p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{s.domain}</p>
                      {s.title && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {s.title}
                        </p>
                      )}
                    </div>
                    <span
                      className={`
                        text-[10px] font-medium px-2 py-0.5 rounded shrink-0
                        ${s.status === "COMPLETED" ? "bg-success/10 text-success" : ""}
                        ${s.status === "FAILED" ? "bg-destructive/10 text-destructive" : ""}
                        ${s.status === "RUNNING" ? "bg-warning/10 text-warning" : ""}
                      `}
                    >
                      {s.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{s.facts_total} facts</span>
                    <span>{s.key_claims} key</span>
                    <span>{s.needs_review} need review</span>
                    <span>{s.pinned} pinned</span>
                  </div>
                  {s.last_error && (
                    <p className="text-xs text-destructive line-clamp-2">{s.last_error}</p>
                  )}
                  <Button
                    data-testid="source-health-open"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => onOpenSource(s.source_url)}
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Open
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

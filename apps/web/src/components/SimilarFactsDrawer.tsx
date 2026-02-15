"use client";

import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchFactsGroup, type Fact } from "@/lib/api";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  groupId: string;
  repFact: Fact;
  collapsedCount: number;
  selectedIds: Set<string>;
  onSelectAllInGroup: (ids: string[]) => void;
  onRepOnly: (repId: string) => void;
  onFactsLoaded?: (facts: Fact[]) => void;
}

export function SimilarFactsDrawer({
  open,
  onOpenChange,
  projectId,
  groupId,
  repFact,
  collapsedCount,
  selectedIds,
  onSelectAllInGroup,
  onRepOnly,
  onFactsLoaded,
}: Props) {
  const { data: groupFacts = [], isLoading } = useQuery({
    queryKey: ["facts-group", projectId, groupId],
    queryFn: ({ signal }) => fetchFactsGroup(projectId, groupId, signal),
    enabled: open && !!groupId,
  });

  if (open && groupFacts.length > 0 && onFactsLoaded) {
    onFactsLoaded(groupFacts);
  }

  const allIds = groupFacts.map((f) => f.id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        data-testid="similar-facts-drawer"
        className="w-[400px] sm:w-[500px] flex flex-col"
      >
        <SheetHeader>
          <SheetTitle>Similar facts ({collapsedCount})</SheetTitle>
        </SheetHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex gap-2 py-3 border-b border-border">
              <Button
                data-testid="similar-facts-select-all"
                variant="outline"
                size="sm"
                onClick={() => onSelectAllInGroup(allIds)}
              >
                Select all in group
              </Button>
              <Button
                data-testid="similar-facts-rep-only"
                variant="outline"
                size="sm"
                onClick={() => onRepOnly(repFact.id)}
              >
                Replace selection with representative only
              </Button>
            </div>
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-2 py-4">
                {groupFacts.map((f) => {
                  const isSelected = selectedIds.has(f.id);
                  const isRep = f.id === repFact.id;
                  return (
                    <div
                      key={f.id}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30"
                    >
                      <span className="text-xs text-muted-foreground font-medium truncate max-w-[80px]" title={f.source_domain}>
                        {f.source_domain}
                      </span>
                      <p className="flex-1 text-sm leading-relaxed text-foreground line-clamp-2">
                        {f.fact_text}
                      </p>
                      {isRep && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">
                          Rep
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

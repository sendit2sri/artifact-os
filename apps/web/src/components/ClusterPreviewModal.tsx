"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Fact } from "@/lib/api";

interface GroupRow {
  groupId: string;
  repFact: Fact;
  collapsedCount: number;
  includeAll: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: GroupRow[];
  onIncludeAllChange: (groupId: string, includeAll: boolean) => void;
  onConfirm: () => void;
}

export function ClusterPreviewModal({
  open,
  onOpenChange,
  groups,
  onIncludeAllChange,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="cluster-preview"
        className="max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Your selection contains duplicates</DialogTitle>
          <DialogDescription>
            Choose whether to include all similar facts or only the representative in each group.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {groups.map((g) => (
            <button
              key={g.groupId}
              type="button"
              onClick={() => onIncludeAllChange(g.groupId, !g.includeAll)}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border w-full text-left transition-colors",
                g.includeAll
                  ? "border-primary bg-primary/5"
                  : "border-border bg-muted/30 hover:bg-muted/50"
              )}
            >
              <span
                className={cn(
                  "mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center text-[10px]",
                  g.includeAll ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground"
                )}
              >
                {g.includeAll ? "✓" : ""}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">
                  {g.includeAll ? "Include all" : "Rep only"}
                </span>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {g.repFact.fact_text}
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {g.collapsedCount} similar
                </span>
              </div>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            data-testid="cluster-preview-confirm"
            onClick={onConfirm}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

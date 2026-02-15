"use client";

import { useMemo, useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Output, OutputSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

type DiffLine = { type: "added" | "removed" | "unchanged"; text: string; lineNum?: number };

function lineDiff(a: string, b: string, collapseUnchanged = 5): DiffLine[] {
  const linesA = a.split(/\r?\n/);
  const linesB = b.split(/\r?\n/);
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;

  const unchanged: DiffLine[] = [];
  const flushUnchanged = (showAll: boolean) => {
    if (unchanged.length <= collapseUnchanged || showAll) {
      result.push(...unchanged);
    } else {
      result.push(...unchanged.slice(0, 2));
      result.push({ type: "unchanged", text: `... ${unchanged.length - 4} lines ...` });
      result.push(...unchanged.slice(-2));
    }
    unchanged.length = 0;
  };

  while (i < linesA.length || j < linesB.length) {
    if (i < linesA.length && j < linesB.length && linesA[i] === linesB[j]) {
      unchanged.push({ type: "unchanged", text: linesA[i], lineNum: i + 1 });
      i++;
      j++;
      continue;
    }
    flushUnchanged(false);

    if (j < linesB.length && (i >= linesA.length || !linesA.slice(i).includes(linesB[j]))) {
      result.push({ type: "added", text: linesB[j], lineNum: j + 1 });
      j++;
      continue;
    }
    if (i < linesA.length && (j >= linesB.length || !linesB.slice(j).includes(linesA[i]))) {
      result.push({ type: "removed", text: linesA[i], lineNum: i + 1 });
      i++;
      continue;
    }
    if (i < linesA.length && j < linesB.length) {
      result.push({ type: "removed", text: linesA[i], lineNum: i + 1 });
      result.push({ type: "added", text: linesB[j], lineNum: j + 1 });
      i++;
      j++;
    }
  }
  flushUnchanged(false);
  return result;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outputsList: OutputSummary[];
  onFetchOutput: (id: string) => Promise<Output>;
}

export function OutputCompareDrawer({ open, onOpenChange, outputsList, onFetchOutput }: Props) {
  const [outputA, setOutputA] = useState<Output | null>(null);
  const [outputB, setOutputB] = useState<Output | null>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [expandedDiff, setExpandedDiff] = useState(false);

  const defaultA = outputsList[0]?.id ?? "";
  const defaultB = outputsList[1]?.id ?? "";

  const loadA = (id: string) => {
    if (!id) return;
    setLoadingA(true);
    onFetchOutput(id).then((o) => { setOutputA(o); setLoadingA(false); }).catch(() => setLoadingA(false));
  };

  const loadB = (id: string) => {
    if (!id) return;
    setLoadingB(true);
    onFetchOutput(id).then((o) => { setOutputB(o); setLoadingB(false); }).catch(() => setLoadingB(false));
  };

  const [selectedA, setSelectedA] = useState("");
  const [selectedB, setSelectedB] = useState("");

  useEffect(() => {
    if (!open) return;
    if (outputsList.length >= 1 && defaultA && !outputA) loadA(defaultA);
    if (outputsList.length >= 2 && defaultB && !outputB) loadB(defaultB);
  }, [open, defaultA, defaultB, outputsList.length]);

  const handleSelectA = (id: string) => {
    setSelectedA(id);
    loadA(id);
  };

  const handleSelectB = (id: string) => {
    setSelectedB(id);
    loadB(id);
  };

  const diffLines = useMemo(() => {
    if (!outputA?.content || !outputB?.content) return [];
    return lineDiff(outputA.content, outputB.content, expandedDiff ? 9999 : 5);
  }, [outputA?.content, outputB?.content, expandedDiff]);

  const hasCollapsed = diffLines.some((l) => l.text.startsWith("... ") && l.text.includes(" lines "));

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        data-testid="outputs-compare-drawer"
        side="right"
        nonModal
        className="w-[600px] sm:w-[700px] flex flex-col p-0"
        closeButtonTestId="outputs-compare-close"
      >
        <SheetHeader className="px-6 py-4 border-b border-border shrink-0">
          <SheetTitle>Compare Outputs</SheetTitle>
        </SheetHeader>

        <div className="p-4 space-y-4 flex-1 flex flex-col min-h-0">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground block mb-1">Output A</label>
              <Select
                value={outputA?.id ?? (selectedA || defaultA)}
                onValueChange={handleSelectA}
                disabled={!outputsList.length}
              >
                <SelectTrigger data-testid="outputs-compare-select-a" className="w-full">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {outputsList.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.title} ({o.mode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground block mb-1">Output B</label>
              <Select
                value={outputB?.id ?? (selectedB || defaultB)}
                onValueChange={handleSelectB}
                disabled={!outputsList.length}
              >
                <SelectTrigger data-testid="outputs-compare-select-b" className="w-full">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {outputsList.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.title} ({o.mode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(loadingA || loadingB) && !outputA && !outputB ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Loading...
            </div>
          ) : (
            <ScrollArea className="flex-1 min-h-0 rounded border border-border bg-muted/30">
              <div data-testid="outputs-compare-diff" className="p-4 font-mono text-sm">
                {diffLines.length === 0 && outputA && outputB && outputA.content === outputB.content ? (
                  <p className="text-muted-foreground">No differences.</p>
                ) : (
                  diffLines.map((line, idx) => (
                    <div
                      key={idx}
                      data-testid={
                        line.type === "added"
                          ? "diff-line-added"
                          : line.type === "removed"
                          ? "diff-line-removed"
                          : "diff-line-unchanged"
                      }
                      className={cn(
                        "py-0.5 px-2 -mx-2",
                        line.type === "added" && "bg-green-500/10 text-green-700 dark:text-green-400",
                        line.type === "removed" && "bg-red-500/10 text-red-700 dark:text-red-400",
                        line.type === "unchanged" && "text-muted-foreground"
                      )}
                    >
                      {line.type === "added" && "+ "}
                      {line.type === "removed" && "- "}
                      {line.text}
                    </div>
                  ))
                )}
                {hasCollapsed && !expandedDiff && (
                  <Button
                    data-testid="diff-show-more"
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => setExpandedDiff(true)}
                  >
                    Show more
                  </Button>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sparkles, Plus, Trash2, X, FolderOpen, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn, randomUUID } from "@/lib/utils";

export interface Bucket {
  id: string;
  name: string;
  factIds: string[];
}

interface FactMapEntry {
  id: string;
  text: string;
  source_domain?: string;
}

interface BucketsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buckets: Bucket[];
  onBucketsChange: (updater: (prev: Bucket[]) => Bucket[]) => void;
  factMap: Map<string, FactMapEntry>;
  onGenerateFromBucket: (bucket: Bucket) => void;
  isSynthesizing: boolean;
  onFactDrop?: (bucketId: string, factId: string) => void;
  bucketsDirty?: boolean;
  bucketsSaving?: boolean;
  bucketsSaved?: boolean;
  onSaveBuckets?: () => void;
}

export function BucketsPanel({
  open,
  onOpenChange,
  buckets,
  onBucketsChange,
  factMap,
  onGenerateFromBucket,
  isSynthesizing,
  onFactDrop,
  bucketsDirty = false,
  bucketsSaving = false,
  bucketsSaved = false,
  onSaveBuckets,
}: BucketsPanelProps) {
  const [newBucketName, setNewBucketName] = useState("");

  const addBucket = () => {
    const name = newBucketName.trim() || "Unnamed";
    onBucketsChange((prev) => [...prev, { id: randomUUID(), name, factIds: [] }]);
    setNewBucketName("");
  };

  const removeBucket = (id: string) => {
    onBucketsChange((prev) => prev.filter((b) => b.id !== id));
  };

  const clearBucket = (id: string) => {
    onBucketsChange((prev) => prev.map((b) => (b.id === id ? { ...b, factIds: [] } : b)));
  };

  const removeFactFromBucket = (bucketId: string, factId: string) => {
    onBucketsChange((prev) =>
      prev.map((b) => (b.id === bucketId ? { ...b, factIds: b.factIds.filter((f) => f !== factId) } : b))
    );
  };

  const handleGenerate = (bucket: Bucket) => {
    if (bucket.factIds.length < 2) {
      toast.error("Add at least 2 facts to this bucket");
      return;
    }
    onGenerateFromBucket(bucket);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        data-testid="buckets-panel"
        side="right"
        nonModal
        className="w-[400px] sm:w-[440px] flex flex-col p-0 gap-0"
      >
        <SheetHeader className="px-6 py-4 border-b border-border shrink-0 flex flex-row items-center justify-between space-y-0">
          <SheetTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Buckets
            {bucketsDirty && (
              <span data-testid="buckets-dirty" className="text-xs font-normal text-muted-foreground">
                (unsaved)
              </span>
            )}
            {bucketsSaved && (
              <span data-testid="buckets-saved" className="text-xs font-normal text-green-600">
                Saved
              </span>
            )}
          </SheetTitle>
          {onSaveBuckets && (
            <Button
              data-testid="buckets-save"
              size="sm"
              variant={bucketsDirty ? "default" : "outline"}
              disabled={!bucketsDirty || bucketsSaving}
              onClick={onSaveBuckets}
            >
              {bucketsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              {bucketsSaving ? "Saving…" : bucketsSaved ? "Saved" : "Save"}
            </Button>
          )}
        </SheetHeader>
        <div className="p-4 border-b border-border flex gap-2 shrink-0">
          <Input
            data-testid="buckets-add-name"
            placeholder="Bucket name"
            className="h-9 text-sm flex-1"
            value={newBucketName}
            onChange={(e) => setNewBucketName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addBucket()}
          />
          <Button data-testid="buckets-add-btn" size="sm" className="h-9" onClick={addBucket}>
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </div>
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-4">
            {buckets.length === 0 && (
              <p className="text-sm text-muted-foreground">No buckets. Add one and drag or add facts from the list.</p>
            )}
            {buckets.map((bucket) => (
              <div
                key={bucket.id}
                data-testid={`bucket-${bucket.id}`}
                className={cn(
                  "rounded-lg border border-border bg-muted/20 p-3 space-y-2",
                  onFactDrop && "border-dashed"
                )}
                onDragOver={(e) => { e.preventDefault(); if (onFactDrop) e.dataTransfer.dropEffect = "copy"; }}
                onDrop={(e) => {
                  e.preventDefault();
                  const factId = e.dataTransfer.getData("fact-id");
                  if (factId && onFactDrop) onFactDrop(bucket.id, factId);
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">{bucket.name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => clearBucket(bucket.id)}
                      disabled={bucket.factIds.length === 0}
                    >
                      Clear
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeBucket(bucket.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                  {bucket.factIds.map((fid) => {
                    const entry = factMap.get(fid);
                    return (
                      <Badge
                        key={fid}
                        variant="secondary"
                        className="text-[10px] max-w-[180px] truncate pr-5 py-1 relative group"
                      >
                        {entry?.text?.slice(0, 30) ?? fid.slice(0, 8)}…
                        <button
                          type="button"
                          className="absolute right-0.5 top-0.5 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted"
                          onClick={() => removeFactFromBucket(bucket.id, fid)}
                          aria-label="Remove from bucket"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
                <Button
                  data-testid={`bucket-generate-${bucket.id}`}
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={() => handleGenerate(bucket)}
                  disabled={bucket.factIds.length < 2 || isSynthesizing}
                >
                  {isSynthesizing ? null : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                  Generate ({bucket.factIds.length} facts)
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

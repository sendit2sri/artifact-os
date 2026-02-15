"use client";

import { useState, useCallback } from "react";
import { updateFact } from "@/lib/api";
import type { Fact } from "@/lib/api";

const MAX_STACK = 20;

export type UndoType = "review_status" | "pin" | "key_claim";

export interface UndoEntry {
  id: string;
  type: UndoType;
  before: { review_status?: Fact["review_status"]; is_pinned?: boolean; is_key_claim?: boolean };
  after: { review_status?: Fact["review_status"]; is_pinned?: boolean; is_key_claim?: boolean };
  ts: number;
}

export interface UndoManager {
  push: (entry: UndoEntry) => void;
  executeUndo: (entry: UndoEntry, onSuccess?: () => void, onError?: (err: Error) => void) => Promise<void>;
  stack: UndoEntry[];
}

export function useUndoManager(): UndoManager {
  const [stack, setStack] = useState<UndoEntry[]>([]);

  const push = useCallback((entry: UndoEntry) => {
    setStack((prev) => {
      const next = [entry, ...prev].slice(0, MAX_STACK);
      return next;
    });
  }, []);

  const executeUndo = useCallback(
    async (
      entry: UndoEntry,
      onSuccess?: () => void,
      onError?: (err: Error) => void
    ) => {
      const updates: Partial<Fact> = {};
      if (entry.before.review_status !== undefined) updates.review_status = entry.before.review_status;
      if (entry.before.is_pinned !== undefined) updates.is_pinned = entry.before.is_pinned;
      if (entry.before.is_key_claim !== undefined) updates.is_key_claim = entry.before.is_key_claim;

      try {
        await updateFact(entry.id, updates);
        setStack((prev) => prev.filter((e) => e.ts !== entry.ts));
        onSuccess?.();
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    },
    []
  );

  return { push, executeUndo, stack };
}

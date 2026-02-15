"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Current workspace ID: persisted in localStorage, synced with server list.
 * Key: artifact_current_workspace_v1
 */

const STORAGE_KEY = "artifact_current_workspace_v1";

export function getCurrentWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setCurrentWorkspaceIdStorage(workspaceId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, workspaceId);
  } catch {
    /* ignore */
  }
}

export function useCurrentWorkspace() {
  const [currentWorkspaceId, setCurrentWorkspaceIdState] = useState<string | null>(null);

  useEffect(() => {
    setCurrentWorkspaceIdState(getCurrentWorkspaceId());
  }, []);

  const setCurrentWorkspaceId = useCallback((workspaceId: string) => {
    setCurrentWorkspaceIdStorage(workspaceId);
    setCurrentWorkspaceIdState(workspaceId);
  }, []);

  return [currentWorkspaceId, setCurrentWorkspaceId] as const;
}

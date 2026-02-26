/**
 * Global E2E types: window.__e2e and window.__consoleErrors (used by app + Playwright tests).
 * Augment Window so (window as any) is not needed.
 */
declare global {
  interface Window {
    __consoleErrors?: string[];
    __e2e?: {
      rqFetchingCount?: number;
      rqMutatingCount?: number;
      state?: {
        phase?: string;
        jobs?: { status: string }[];
        facts?: unknown[];
        outputsCount?: number;
        selectedCount?: number;
        [k: string]: unknown;
      };
      isIdle?: () =>
        | boolean
        | {
            idle: boolean;
            fetching: number;
            mutating: number;
            hasActiveJobs: boolean;
            jobs: { pending: number; running: number; failed: number };
            reasons: string[];
          };
      waitForIdle?: (
        opts?: number | { timeout?: number; requireNoActiveJobs?: boolean }
      ) => Promise<boolean>;
      clearQueryCache?: () => void;
      refetchJobs?: (projectId?: string) => Promise<void>;
      refetchOutputs?: (projectId?: string) => Promise<void>;
      setForceNextSynthesisError?: (enabled: boolean) => void;
      _shouldForceNextSynthesisError?: () => boolean;
      getQueryCacheKeys?: () => unknown[];
      [k: string]: unknown;
    };
  }
}
export {};

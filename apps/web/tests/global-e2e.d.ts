/**
 * E2E window globals for Playwright tests (mirrors src/types/global-e2e.d.ts).
 * Tests may use a tsconfig that excludes src, so we declare here too.
 */
declare global {
  interface Window {
    __consoleErrors?: string[];
    __e2e?: {
      rqFetchingCount?: number;
      rqMutatingCount?: number;
      state?: { phase?: string; jobs?: { status: string }[]; facts?: unknown[]; outputsCount?: number; selectedCount?: number };
      isIdle?: () => boolean | { idle: boolean; reasons?: string[] };
      waitForIdle?: (opts?: number | { timeout?: number; requireNoActiveJobs?: boolean }) => Promise<boolean>;
      clearQueryCache?: () => void;
      refetchJobs?: (projectId?: string) => Promise<void>;
      refetchOutputs?: (projectId?: string) => Promise<void>;
      setForceNextSynthesisError?: (enabled: boolean) => void;
      _shouldForceNextSynthesisError?: () => boolean;
      [k: string]: unknown;
    };
  }
}
export {};

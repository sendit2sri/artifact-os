"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, useEffect } from "react";

const isE2EMode = process.env.NEXT_PUBLIC_E2E_MODE === "true";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // E2E mode: disable automatic refetching to prevent race conditions
        retry: isE2EMode ? false : 3,
        refetchOnWindowFocus: isE2EMode ? false : true,
        refetchOnReconnect: isE2EMode ? false : true,
        staleTime: isE2EMode ? 0 : undefined,
        gcTime: isE2EMode ? 1000 * 60 : 1000 * 60 * 5, // Shorter GC in E2E
      },
      mutations: {
        retry: isE2EMode ? false : 3,
      },
    },
  }));
  
  // Expose E2E controls on window for test helpers + live React Query counters
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // What mode did the browser actually see? (for preflight diagnostics)
      document.documentElement.setAttribute('data-e2e-mode', isE2EMode ? 'true' : 'false');
    }
    if (isE2EMode && typeof window !== 'undefined') {
      // DOM marker for Playwright/screenshots (visible even if JS is delayed)
      document.documentElement.setAttribute('data-e2e', 'true');

      // Live React Query counters: update whenever query/mutation caches change
      const syncCounts = () => {
        if (window.__e2e) {
          window.__e2e.rqFetchingCount = queryClient.isFetching();
          window.__e2e.rqMutatingCount = queryClient.isMutating();
        }
      };

      // Flag for force-error on next synthesis request
      let forceNextSynthesisError = false;
      
      window.__e2e = {
        // Clear all React Query cache
        clearQueryCache: () => {
          queryClient.clear();
          console.log('🧹 E2E: Query cache cleared');
        },
        
        // Check if app is idle (no pending fetches/mutations/jobs)
        // Returns object with idle status + diagnostic reasons (for debug strip)
        isIdle: () => {
          syncCounts();
          const fetching = window.__e2e?.rqFetchingCount ?? queryClient.isFetching();
          const mutating = window.__e2e?.rqMutatingCount ?? queryClient.isMutating();
          
          // Check job status from exposed state
          const jobs = window.__e2e?.state?.jobs ?? [];
          const pending = jobs.filter((j: { status: string }) => j.status === "PENDING").length;
          const running = jobs.filter((j: { status: string }) => j.status === "RUNNING").length;
          const failed = jobs.filter((j: { status: string }) => j.status === "FAILED").length;
          const hasActiveJobs = jobs.some((j: { status: string }) => ["PENDING", "RUNNING"].includes(j.status));
          
          const idle = fetching === 0 && mutating === 0 && !hasActiveJobs;
          
          // Build reasons (always show fetching/mutating so debug strip explains why idle is false)
          const reasons: string[] = [];
          if (fetching > 0) reasons.push(`fetching=${fetching}`);
          if (mutating > 0) reasons.push(`mutating=${mutating}`);
          if (hasActiveJobs) reasons.push(`jobs=${pending}p/${running}r`);
          
          // Return diagnostic object (backward compat: truthy if idle)
          const result: {
            idle: boolean;
            fetching: number;
            mutating: number;
            hasActiveJobs: boolean;
            jobs: { pending: number; running: number; failed: number };
            reasons: string[];
            valueOf: () => boolean;
            toString: () => string;
          } = {
            idle,
            fetching,
            mutating,
            hasActiveJobs,
            jobs: { pending, running, failed },
            reasons,
            valueOf: () => idle,
            toString: () => idle ? 'true' : `false(${reasons.join(',')})`,
          };
          
          return result;
        },
        
        // Wait for app to be idle. opts.requireNoActiveJobs (default true) = also wait for no PENDING/RUNNING jobs.
        waitForIdle: (timeoutOrOpts: number | { timeout?: number; requireNoActiveJobs?: boolean } = 10000) => {
          const opts = typeof timeoutOrOpts === 'number'
            ? { timeout: timeoutOrOpts, requireNoActiveJobs: true }
            : { timeout: 10000, requireNoActiveJobs: true, ...timeoutOrOpts };
          const timeoutMs = opts.timeout ?? 10000;
          const requireNoActiveJobs = opts.requireNoActiveJobs !== false;
          return new Promise((resolve, reject) => {
            const start = Date.now();
            const check = () => {
              syncCounts();
              const fetchCount = window.__e2e?.rqFetchingCount ?? queryClient.isFetching();
              const mutCount = window.__e2e?.rqMutatingCount ?? queryClient.isMutating();
              const queryIdle = fetchCount === 0 && mutCount === 0;
              const rawJobs = window.__e2e?.state?.jobs;
              // If requireNoActiveJobs and jobs is undefined (race on first mount), treat as not idle until exported.
              const jobsUnknown = requireNoActiveJobs && rawJobs === undefined;
              const jobs = rawJobs ?? [];
              const hasActiveJobs = jobsUnknown || (requireNoActiveJobs && jobs.some((j: { status: string }) => ["PENDING", "RUNNING"].includes(j.status)));
              const hasFailedJobs = Array.isArray(jobs) && jobs.some((j: { status: string }) => j.status === "FAILED");
              if (queryIdle && !hasActiveJobs) {
                if (hasFailedJobs) {
                  console.warn('⚠️ App idle but has failed jobs:', jobs.filter((j: { status: string }) => j.status === "FAILED"));
                }
                resolve(true);
              } else if (Date.now() - start > timeoutMs) {
                syncCounts();
                const pending = Array.isArray(jobs) ? jobs.filter((j: { status: string }) => j.status === "PENDING").length : 0;
                const running = Array.isArray(jobs) ? jobs.filter((j: { status: string }) => j.status === "RUNNING").length : 0;
                const failed = Array.isArray(jobs) ? jobs.filter((j: { status: string }) => j.status === "FAILED").length : 0;
                const rawJobsType = rawJobs === undefined ? "undefined" : Array.isArray(rawJobs) ? "array" : typeof rawJobs;
                const phase = window.__e2e?.state?.phase ?? "unknown";
                const rqFetch = window.__e2e?.rqFetchingCount ?? 0;
                const rqMut = window.__e2e?.rqMutatingCount ?? 0;
                
                reject(new Error(
                  `Timeout waiting for idle (${timeoutMs}ms):\n` +
                  `  rqFetchingCount: ${rqFetch}\n` +
                  `  rqMutatingCount: ${rqMut}\n` +
                  `  jobsUnknown: ${jobsUnknown}\n` +
                  `  rawJobsType: ${rawJobsType}\n` +
                  `  phase: ${phase}\n` +
                  `  pending jobs: ${pending}\n` +
                  `  running jobs: ${running}\n` +
                  `  failed jobs: ${failed}`
                ));
              } else {
                setTimeout(check, 100);
              }
            };
            check();
          });
        },
        
        // Get current query cache keys (for debugging)
        getQueryCacheKeys: () => {
          return queryClient.getQueryCache().getAll().map(q => q.queryKey);
        },

        // Force-refetch project jobs (avoid waiting for 2.5s polling cadence)
        // If projectId is provided, targets that project's jobs query exactly.
        // Otherwise, invalidates all queries whose key starts with ["project-jobs"].
        refetchJobs: async (projectId?: string) => {
          if (projectId) {
            const key = ["project-jobs", projectId] as const;

            await queryClient.invalidateQueries({ queryKey: key, exact: true });

            // Refetch even if inactive momentarily (more deterministic than type:"active")
            await queryClient.refetchQueries({ queryKey: key, exact: true, type: "all" });

            return;
          }

          await queryClient.invalidateQueries({ queryKey: ["project-jobs"], exact: false });
          await queryClient.refetchQueries({ queryKey: ["project-jobs"], exact: false, type: "all" });
        },

        // Force-refetch project outputs (avoid waiting for UI polling / stale cache)
        refetchOutputs: async (projectId?: string) => {
          if (projectId) {
            const key = ["project-outputs", projectId] as const;
            await queryClient.refetchQueries({
              queryKey: key,
              exact: true,
              type: "all",
            });
            return;
          }
          await queryClient.refetchQueries({
            queryKey: ["project-outputs"],
            exact: false,
            type: "all",
          });
        },

        // Force next synthesis request to return error (for E2E error handling tests)
        setForceNextSynthesisError: (enabled: boolean) => {
          forceNextSynthesisError = enabled;
        },
        
        // Internal: check if force-error is enabled (used by synthesis request logic)
        _shouldForceNextSynthesisError: () => {
          const shouldForce = forceNextSynthesisError;
          forceNextSynthesisError = false; // Auto-reset after check (one-shot)
          return shouldForce;
        },
      };

      window.__e2e.state = window.__e2e.state ?? {
        phase: 'boot',
        jobs: [],
        facts: [],
        outputsCount: 0,
        selectedCount: 0,
      };

      syncCounts();

      const unsubQ = queryClient.getQueryCache().subscribe(() => syncCounts());
      const unsubM = queryClient.getMutationCache().subscribe(() => syncCounts());

      console.log('🧪 E2E controls exposed on window.__e2e (live RQ counters)');

      return () => {
        unsubQ();
        unsubM();
      };
    }
  }, [queryClient]);
  
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        forcedTheme={isE2EMode ? "light" : undefined}
      >
        {isE2EMode && (
          <style>{`
            /* Disable all animations in E2E mode for deterministic timing */
            *, *::before, *::after {
              animation-duration: 0s !important;
              animation-delay: 0s !important;
              transition-duration: 0s !important;
              transition-delay: 0s !important;
            }
          `}</style>
        )}
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}

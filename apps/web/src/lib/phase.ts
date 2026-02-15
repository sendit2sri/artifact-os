/**
 * Application Phase State Machine
 * 
 * Provides a clear, deterministic way to track the application's current phase
 * based on sources, jobs, and facts. This prevents UI ambiguity and enables
 * phase-specific messaging and controls.
 * 
 * Phase Hierarchy (from low to high):
 * 1. EMPTY - No sources, no jobs, no facts
 * 2. INGESTING - Sources added, jobs pending/running
 * 3. PROCESSING - Some facts extracted, jobs still running
 * 4. READY - All jobs complete, facts available
 * 5. ERROR - Jobs failed and no facts available
 * 
 * Phase transitions are unidirectional per session (except ERROR can occur anytime).
 */

export type AppPhase = 
  | "EMPTY"       // No sources added yet
  | "INGESTING"   // Sources added, waiting for extraction
  | "PROCESSING"  // Facts being extracted/processed
  | "READY"       // Facts available, jobs complete
  | "ERROR";      // Failed with no facts

export interface PhaseState {
  phase: AppPhase;
  details: {
    sourcesCount: number;
    pendingJobs: number;
    runningJobs: number;
    completedJobs: number;
    failedJobs: number;
    factsCount: number;
    hasActiveWork: boolean;
    hasErrors: boolean;
  };
}

/**
 * Compute current application phase based on data state
 */
export function computeAppPhase(
  sources: { status: string }[],
  jobs: { status: string }[],
  facts: unknown[]
): PhaseState {
  const sourcesCount = sources.length;
  const factsCount = facts.length;
  
  const pendingJobs = jobs.filter(j => j.status === "PENDING").length;
  const runningJobs = jobs.filter(j => j.status === "RUNNING").length;
  const completedJobs = jobs.filter(j => j.status === "COMPLETED").length;
  const failedJobs = jobs.filter(j => j.status === "FAILED").length;
  
  const hasActiveWork = pendingJobs > 0 || runningJobs > 0;
  const hasErrors = failedJobs > 0;
  const allJobsFailed = jobs.length > 0 && failedJobs === jobs.length;

  const details = {
    sourcesCount,
    pendingJobs,
    runningJobs,
    completedJobs,
    failedJobs,
    factsCount,
    hasActiveWork,
    hasErrors,
  };

  // Phase determination logic
  
  // EMPTY: No sources at all
  if (sourcesCount === 0) {
    return { phase: "EMPTY", details };
  }

  // ERROR: All jobs failed and no facts available
  if (allJobsFailed && factsCount === 0) {
    return { phase: "ERROR", details };
  }

  // INGESTING: Sources added, jobs pending/running, no facts yet
  if (hasActiveWork && factsCount === 0) {
    return { phase: "INGESTING", details };
  }

  // PROCESSING: Some facts extracted, jobs still running
  if (hasActiveWork && factsCount > 0) {
    return { phase: "PROCESSING", details };
  }

  // READY: Facts available, no active work (may have completed or failed jobs)
  if (factsCount > 0 && !hasActiveWork) {
    return { phase: "READY", details };
  }

  // Default: READY (sources exist, jobs complete, even if 0 facts)
  return { phase: "READY", details };
}

/**
 * Get phase-specific UI messaging
 */
export function getPhaseMessage(phaseState: PhaseState): {
  title: string;
  description: string;
  action?: string;
} {
  const { phase, details } = phaseState;

  switch (phase) {
    case "EMPTY":
      return {
        title: "Ready to start",
        description: "Add your first source to begin extracting facts",
        action: "Add source",
      };

    case "INGESTING":
      return {
        title: "Processing sources",
        description: `Extracting facts from ${details.sourcesCount} source${details.sourcesCount !== 1 ? 's' : ''}...`,
      };

    case "PROCESSING":
      return {
        title: "Extracting facts",
        description: `${details.factsCount} fact${details.factsCount !== 1 ? 's' : ''} extracted, ${details.runningJobs + details.pendingJobs} job${details.runningJobs + details.pendingJobs !== 1 ? 's' : ''} remaining`,
      };

    case "READY":
      if (details.hasErrors && details.factsCount === 0) {
        return {
          title: "Processing complete with issues",
          description: `${details.failedJobs} source${details.failedJobs !== 1 ? 's' : ''} failed. Try adding different sources.`,
          action: "Add source",
        };
      }
      return {
        title: "Facts ready",
        description: `${details.factsCount} fact${details.factsCount !== 1 ? 's' : ''} extracted from ${details.sourcesCount} source${details.sourcesCount !== 1 ? 's' : ''}`,
      };

    case "ERROR":
      return {
        title: "Processing failed",
        description: `All ${details.failedJobs} source${details.failedJobs !== 1 ? 's' : ''} failed. Check source URLs and try again.`,
        action: "Retry sources",
      };

    default:
      return {
        title: "Unknown state",
        description: "Application state unclear",
      };
  }
}

/**
 * Check if phase allows certain actions
 */
export function canPerformAction(
  phaseState: PhaseState,
  action: "synthesize" | "filter" | "export" | "add_source"
): boolean {
  const { phase, details } = phaseState;

  switch (action) {
    case "synthesize":
      // Can synthesize if we have facts and no active work
      return details.factsCount > 0 && !details.hasActiveWork;

    case "filter":
      // Can filter if we have facts
      return details.factsCount > 0;

    case "export":
      // Can export if we have facts
      return details.factsCount > 0;

    case "add_source":
      // Can always add sources
      return true;

    default:
      return false;
  }
}

/**
 * Get phase-appropriate CTA (Call To Action)
 */
export function getPhaseCTA(phaseState: PhaseState): {
  label: string;
  action: "add_source" | "synthesize" | "retry" | "wait" | null;
  disabled: boolean;
  variant: "primary" | "secondary" | "outline";
} {
  const { phase, details } = phaseState;

  switch (phase) {
    case "EMPTY":
      return {
        label: "Add your first source",
        action: "add_source",
        disabled: false,
        variant: "primary",
      };

    case "INGESTING":
    case "PROCESSING":
      return {
        label: "Processing...",
        action: "wait",
        disabled: true,
        variant: "outline",
      };

    case "ERROR":
      return {
        label: "Retry failed sources",
        action: "retry",
        disabled: false,
        variant: "primary",
      };

    case "READY":
      if (details.factsCount === 0) {
        return {
          label: "Add more sources",
          action: "add_source",
          disabled: false,
          variant: "primary",
        };
      }
      return {
        label: "Generate synthesis",
        action: "synthesize",
        disabled: false,
        variant: "primary",
      };

    default:
      return {
        label: "Continue",
        action: null,
        disabled: true,
        variant: "outline",
      };
  }
}

/**
 * Get phase color for UI elements
 */
export function getPhaseColor(phase: AppPhase): {
  bg: string;
  text: string;
  border: string;
} {
  switch (phase) {
    case "EMPTY":
      return {
        bg: "bg-muted",
        text: "text-muted-foreground",
        border: "border-border",
      };

    case "INGESTING":
    case "PROCESSING":
      return {
        bg: "bg-warning/10",
        text: "text-warning",
        border: "border-warning/30",
      };

    case "ERROR":
      return {
        bg: "bg-destructive/10",
        text: "text-destructive",
        border: "border-destructive/30",
      };

    case "READY":
      return {
        bg: "bg-success/10",
        text: "text-success",
        border: "border-success/30",
      };

    default:
      return {
        bg: "bg-muted",
        text: "text-muted-foreground",
        border: "border-border",
      };
  }
}

/**
 * Hook-like helper for computing phase from query data
 * (Can be used in components with useQuery results)
 */
export function useAppPhase(
  sources: { status: string }[] | undefined,
  jobs: { status: string }[] | undefined,
  facts: unknown[] | undefined
): PhaseState {
  return computeAppPhase(
    sources ?? [],
    jobs ?? [],
    facts ?? []
  );
}

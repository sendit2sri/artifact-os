/**
 * E2E Seed Contract
 * 
 * Defines the expected properties of seeded test data.
 * Tests and seed endpoint must stay in sync via these constants.
 * 
 * Purpose: Prevent silent drift where tests assume seed properties that no longer exist.
 */

/**
 * The search term that ALL seeded facts must contain.
 * Used by tests that filter facts via search input.
 */
export const E2E_SEED_SEARCH_TERM = "research";

/**
 * Minimum counts expected from kitchen sink seed (facts_count >= 4).
 */
export const E2E_SEED_MIN_FACTS = 4;
export const E2E_SEED_MIN_APPROVED = 2;
export const E2E_SEED_MIN_PINNED = 2;
export const E2E_SEED_MIN_REVIEW_QUEUE = 2;
export const E2E_SEED_MIN_WITH_EVIDENCE = 2;

/**
 * Expected workspace names from seed.
 * Backend creates both workspaces; tests can switch between them.
 */
export const E2E_SEED_WORKSPACES = {
  personal: "Personal",
  team: "Team",
};

/**
 * Expected workspace IDs (deterministic UUIDs from backend seed).
 */
export const E2E_SEED_WORKSPACE_IDS = {
  personal: "123e4567-e89b-12d3-a456-426614174000",
  team: "123e4567-e89b-12d3-a456-426614174099",
};

/**
 * Verify seed data meets contract requirements.
 * Call after seed but before tests to fail fast with actionable error.
 */
export interface SeedVerificationResult {
  success: boolean;
  error?: string;
  details?: {
    facts_count: number;
    approved_count: number;
    pinned_count: number;
    search_term_matches: number;
  };
}

export function verifySeedContract(seedResponse: any): SeedVerificationResult {
  const verification = seedResponse.seed_verification;
  if (!verification) {
    return {
      success: false,
      error: "Seed response missing verification data",
    };
  }

  // Check minimum fact count
  if (verification.actual_facts < E2E_SEED_MIN_FACTS) {
    return {
      success: false,
      error: `Seed contract violation: expected >= ${E2E_SEED_MIN_FACTS} facts, got ${verification.actual_facts}`,
      details: {
        facts_count: verification.actual_facts,
        approved_count: 0,
        pinned_count: 0,
        search_term_matches: 0,
      },
    };
  }

  // Check approved facts
  if (!verification.has_approved) {
    return {
      success: false,
      error: `Seed contract violation: expected >= ${E2E_SEED_MIN_APPROVED} approved facts, got 0`,
    };
  }

  // Check facts with evidence
  if (!verification.has_evidence) {
    return {
      success: false,
      error: `Seed contract violation: expected >= ${E2E_SEED_MIN_WITH_EVIDENCE} facts with evidence, got 0`,
    };
  }

  return {
    success: true,
    details: {
      facts_count: seedResponse.facts_count ?? 0,
      approved_count: seedResponse.approved_count ?? 0,
      pinned_count: seedResponse.pinned_count ?? 0,
      search_term_matches: 0, // Requires separate API call to verify
    },
  };
}

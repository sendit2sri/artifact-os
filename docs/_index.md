# Docs Index

Start here: [[README]] — buckets and naming.

## Project Summary (for AI / next implementations)
- [[PROJECT_SUMMARY_FOR_GEMINI]] 📋 — Whole project summary: features, fixes, E2E gaps, next steps

## Docs Rules

- [[misc/docs-rules]] — no root .md except README/QUICK_START; where to put new docs; index links.

## Testing / E2E
- [[testing/e2e/]]
- [[testing/e2e/PRE_MERGE_CHECKLIST]] ✅ — Manual + E2E checklist before PR
- [[testing/e2e/E2E_SEED_CONTRACT]] 🎯 — Seed data contract (prevents silent drift, fail-fast preflight)
- [[testing/e2e/VIEW_STATE_ACCEPTANCE_TESTS]] ✅ — 25 tests for view state refactor (7 bugs + features)
- [[testing/e2e/E2E_IDLE_CONTRACT]] ⭐ — Canonical idle definition (prevents flakes)
- [[testing/e2e/TIER_0_STABILITY_PRIMITIVES]] 🎯 — Core architectural primitives (animations, app idle, auto cleanup, known IDs)
- [[testing/e2e/TIER_1_RACE_CONDITIONS]] 🎯 — Race condition fixes (synthesis, URL hydration, evidence nav snapshot)
- [[testing/e2e/E2E_STABILIZATION_FEB_2026]] ⭐ — Kitchen sink seed + comprehensive fixes (85→31 failures)
- [[testing/e2e/E2E_GUARDRAILS_STABILITY]] ⭐ — Long-term stability guardrails + remaining gaps
- [[testing/e2e/CORE_LOOP_POLISH_V1_E2E]]
- [[testing/e2e/TRUST_REVIEW_LOOP_V1_E2E]]
- [[testing/e2e/TRUST_QUALITY_V2_E2E]]
- [[testing/e2e/EVIDENCE_CAPTURE_HIGHLIGHT_V1_E2E]]
- [[testing/e2e/TRUST_GATED_SYNTHESIS_V1_E2E]]
- [[testing/e2e/FACTS_SORT_GROUP_E2E]]
- [[testing/e2e/2026-02-08_outputs-history-e2e]]
- [[testing/e2e/2026-02-08_ux-panels-output-types-facts]]
- [[testing/e2e/2026-02-08_fact-status-actions]]
- [[testing/e2e/OUTPUTS_SEED_MULTI_OUTPUT_FEB2026]]
- [[testing/e2e/PANELS_PIN_BACK_E2E]]
- [[testing/e2e/FOCUS_MODE_REGENERATE_E2E]]
- [[testing/e2e/OUTPUTS_HISTORY_E2E]]
- [[testing/e2e/EVIDENCE_PANEL_E2E]]
- [[testing/e2e/SOURCES_ADD_URL_E2E]]
- [[testing/e2e/MULTISOURCE_IMPORT_V1_E2E]]
- [[testing/e2e/SOURCE_HEALTH_RESILIENCE_V1_E2E]]
- [[testing/e2e/PROJECT_RENAME_E2E]]
- [[testing/e2e/EXPORT_E2E]]
- [[testing/e2e/RUN_E2E]]
- [[testing/e2e/E2E_FAILED_TESTS_SUMMARY_FEB_2026]] 📋 — 19 failed tests: root causes + fix options (Feb 2026)
- [[testing/e2e/CI_E2E_PARALLEL_FIX_FEB2026]]
- [[testing/e2e/E2E_WORKER_INDEX_FIX_FEB2026]]
- [[testing/e2e/PIN_OUTPUT_SELECTION_E2E]]
- [[testing/e2e/ONBOARDING_QUICKSTART_E2E]]
- [[testing/e2e/SAVED_VIEWS_PERF_V1_E2E]]
- [[testing/e2e/WORKSPACE_COLLAB_V1_E2E]]
- [[testing/e2e/FACT_DEDUP_CLUSTER_PREVIEW_V1_E2E]]
- [[testing/e2e/PRODUCTIVITY_RECOVERY_V1_E2E]]
- [[testing/e2e/OUTPUT_EVIDENCE_MAP_V1_E2E]]
- [[testing/e2e/OUTPUT_QUALITY_ACTIONS_V1_E2E]]
- [[testing/e2e/SHARE_AUDIT_V1_E2E]]

## Release
- [[release/RUNBOOK]] — Deploy, rollback, secrets, healthchecks
- [[release/PR_TEMPLATE_UX_STABILITY]] — PR template for UX stability merge

## Changes
- [[changes/2026/02/]]

## Release
- [[release/]]

## Solutions
- [[solutions/DOCKER_GHCR_SETUP]] — Docker + GHCR pro setup (CI, publish, prod compose)

## Routing
- [[routing/]]

## Features
- [[features/]]
- [[features/scira-v1-query-intake-plan]] — Scira V1: query-based intake (search → enqueue URLs, feature-flagged, rate-limited)
- [[features/graph-view-ticnote-v1-plan]] — Graph View (TicNote V1): clusters + click-to-focus facts list
- [[features/TOOLBAR_CONSOLIDATION_PLAN]] — Toolbar: Tabs + Search + Filters sheet + Primary CTA; move Sort/Group/Collapse/Selected into sheet
- [[features/FEATURE_SYNTHESIS_HISTORY]]
- [[features/krisp-v1.5-youtube-captions-plan]] — Krisp V1.5: YouTube captions-only ingest + fallback

## Architecture
- [[architecture/]]
- [[architecture/COMPLETE_IMPLEMENTATION_SUMMARY_FEB_2026]] 🎊 — **START HERE**: Complete summary (9 features, 7 bugs, 25 tests)
- [[architecture/CRITICAL_PATH_COMPLETED_FEB_2026]] 🎉 — Critical path summary (6 features, 7 bugs fixed)
- [[architecture/PHASE_MODEL]] 🎯 — Phase state machine (EMPTY/INGESTING/PROCESSING/READY/ERROR)
- [[architecture/EMPTY_ONLY_OVERLAY]] ✨ — Onboarding integrated into EMPTY phase
- [[architecture/QUEUED_WATCHDOG]] 🚨 — NEW: Stuck job detection + retry (30s threshold)
- [[architecture/VIEW_STATE_IMPLEMENTATION_COMPLETED]] ✅ — COMPLETED: View state refactor (7 bugs fixed)
- [[architecture/IMPLEMENTATION_SUMMARY_FEB_2026]] 🚀 — START HERE: Complete implementation guide
- [[architecture/STATE_HIERARCHY]] ⭐ — View state priority rules (URL/localStorage/server prefs)
- [[architecture/VIEW_STATE_REFACTOR_IMPLEMENTATION]] 🎯 — Complete refactor guide fixing 7 critical bugs
- [[architecture/UX_POLISH_ROADMAP_FEB_2026]] — UX polish & stability roadmap
- [[architecture/UI_INVARIANTS]] 📏 — Non-negotiable UI standards (control heights, spacing, chips)

## Solutions
- [[solutions/]]
- [[solutions/E2E_IDLE_CONTRACT_FIX_FEB_2026]] 🔧 — Idle contract broken (fetching > 0 in dev) + diagnostic reasons
- [[solutions/E2E_SEED_CONTRACT_VIOLATIONS_FEB_2026]] 📋 — Complete summary: 2 seed violations (search + workspaces)
- [[solutions/E2E_TEST_FAILURES_SEED_DATA_MISMATCH]] 🔍 — Detailed diagnosis: search query mismatch (Feb 2026)
- [[solutions/DOCKER_COMMANDS]]

## Tools / DevLoop
- `tools/devloop/TASK.md` — Single source of truth for DevLoop tasks
- `tools/devloop/DEVLOOP_PLAYBOOK.md` — DevLoop playbook (usage, config, troubleshooting)

## Misc
- [[misc/]]
- [[misc/docs-rules]]
- [[misc/DOC_GENERATOR_PROMPT]]

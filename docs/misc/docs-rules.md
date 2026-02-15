# Docs Rules

## Rule

- **No new .md files in repo root** except `README.md` and `QUICK_START.md`.
- Any new documentation **MUST** be created under `docs/**` and **MUST** be linked from [[_index]].

## Where docs go

| Type | Bucket | Example path |
|------|--------|--------------|
| Bugfixes, patches, incidents | `docs/changes/YYYY/MM/` | `docs/changes/2026/02/2026-02-08_seed-fk-fix.md` |
| E2E, Playwright, tests, CI | `docs/testing/e2e/` | `docs/testing/e2e/2026-02-08_worker-index_e2e.md` |
| Features, UX, acceptance | `docs/features/` | `docs/features/FEATURE_foo.md` |
| System design, APIs, decisions | `docs/architecture/` | `docs/architecture/IMPLEMENTATION_foo.md` |
| Release notes, rollout | `docs/release/` | `docs/release/RELEASE_NOTES_step_13.md` |
| Routing, proxy, CORS | `docs/routing/` | `docs/routing/ROUTING_ARCHITECTURE.md` |
| Dev-ex, tooling, troubleshooting | `docs/solutions/` | `docs/solutions/SOLUTION_hmr_stability.md` |
| Other | `docs/misc/` | `docs/misc/docs-rules.md` |

## Example filenames

- `docs/changes/2026/02/2026-02-08_seed-fk-fix.md`
- `docs/testing/e2e/2026-02-08_worker-index_e2e.md`
- `docs/solutions/2026-02-08_hmr-stability_solution.md`
- Slug: kebab-case, 3–6 words, no "the/and/of".

## Adding links to the index

1. Open `docs/_index.md`.
2. Under the right section (Testing / E2E, Changes, Misc, etc.), add a bullet: `- [[path/to/doc]]` (no `.md`).
3. Keep sections tidy.

## Enforcement

- Script: `scripts/check-no-root-md.sh` — fails (exit 1) if any `*.md` exists in repo root other than README.md and QUICK_START.md.
- Run: from repo root, `bash scripts/check-no-root-md.sh`; or from `apps/web`, `npm run docs:lint`.
- Optional pre-commit: `git config core.hooksPath .githooks` — then the hook runs the same check before each commit.

---
**Related:** [[_index]]

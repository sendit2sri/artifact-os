# Docs

All project docs live under `docs/`. Entry point: [[_index]].

## Buckets

| Bucket | Use for |
|--------|--------|
| `changes/YYYY/MM/` | Bugfixes, patches, incident notes |
| `testing/e2e/` | Playwright, E2E, CI, selectors |
| `features/` | Feature specs, UX, acceptance |
| `architecture/` | System design, APIs, decisions |
| `release/` | Release notes, rollout |
| `routing/` | Routing, proxy, CORS |
| `solutions/` | Dev-ex, tooling, troubleshooting |
| `misc/` | Everything else |

## Naming

- **Slug:** kebab-case, 3–6 words, no "the/and/of".
- **Examples:** `2026-02-08_seed-fk-fix.md`, `FEATURE_foo.md`, `SOLUTION_hmr-stability.md`.
- **Index:** Add a link under the right section in `docs/_index.md`: `- [[bucket/path/to-doc]]` (no `.md`).

## Rules

- No new `.md` in repo root except README.md and QUICK_START.md.
- New docs go under `docs/**` and are linked from [[_index]].

Full rules and enforcement: [[misc/docs-rules]].

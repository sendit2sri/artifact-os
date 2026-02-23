# Docker + GHCR Pro Setup

## Summary

Pro SaaS builder upgrade: deterministic images, fast CI, GHCR push on main, migrations guardrails.

## What changed

- **Web Dockerfile:** `npm prune --omit=dev` in builder → smaller runner image
- **Backend Dockerfile:** `--no-install-recommends`, apt cache cleanup, conditional Playwright (`INSTALL_PLAYWRIGHT`)
- **.dockerignore:** web + backend → faster builds, fewer cache busts
- **CI workflow:** PR checks (compose config validation, backend tests + migrations, web lint/typecheck/build)
- **Publish workflow:** metadata-action (short SHA + latest), three images (web, backend, worker)
- **docker-compose.prod.yml:** restart + healthchecks, worker uses separate image
- **Dev proxy:** port 8080 (avoids privileged 80)

## One-time GitHub settings

1. Repo → Settings → Actions → General
   - Workflow permissions: **Read and write**
2. GHCR uses `GITHUB_TOKEN` automatically with `packages: write`

## Deploy (production)

```bash
# Replace <org>/<repo> in docker-compose.prod.yml with your GitHub org/repo
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml run --rm backend alembic upgrade heads
docker compose -f docker-compose.prod.yml up -d --remove-orphans
docker image prune -f
```

For pinned deploy (zero ambiguity), use `image: ghcr.io/<org>/<repo>-backend:sha-abc1234` and update per release.

## Guardrails

- **NEXT_PUBLIC_API_URL:** Always `/api/v1` (same-origin, proxy routes to backend)
- **Migrations:** Run before restart in prod
- **CI:** Ensures migrations run, web prod build works

## Files touched

- `apps/web/Dockerfile`, `apps/web/.dockerignore`
- `apps/backend/Dockerfile`, `apps/backend/.dockerignore`
- `apps/web/package.json` (typecheck script)
- `.github/workflows/ci.yml`, `.github/dependabot.yml`
- `.github/workflows/publish.yml`
- `docker-compose.yml`, `docker-compose.prod.yml`
- `Makefile`, `QUICK_START.md`

## Links

- [[release/RUNBOOK]] — Deploy, rollback, secrets, healthchecks
- [[solutions/DOCKER_COMMANDS]]
- [[testing/e2e/RUN_E2E]]

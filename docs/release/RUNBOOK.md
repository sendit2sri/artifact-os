# Production Runbook

## Summary

Operational guide for release, deploy, rollback, secrets, and healthchecks.

## One-time setup

### Secret scanning (GitHub)

Prevent accidental commit of secrets:

1. Repo → **Settings** → **Code security and analysis**
2. Enable **Secret scanning**
3. Enable **Push protection**

This blocks pushes containing known secret patterns (API keys, tokens, etc.).

**Alert routing:** Security alerts go to repo admins / configured security team. Configure in Settings → Code security → Dependabot alerts.

**If a secret is blocked or flagged:**
1. Rotate the key immediately in the source service (OpenAI, Firecrawl, etc.)
2. Remove from history if already committed: `git filter-branch` or BFG, or invalidate the secret and force-rotate
3. Update `.env` and any CI secrets
4. Audit where the secret was used

---

## How to cut a release tag

1. Ensure `main` is green and images are pushed to GHCR.

2. **Do not tag from a dirty working tree.** Tag must be created from `main` or a release branch.

3. Create and push a tag:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

4. The publish workflow runs on `v*` tags and pushes images tagged `:0.1.0` (e.g. `ghcr.io/<org>/<repo>-backend:0.1.0`). `latest` is only updated on `main` pushes.

5. Document the release in `docs/changes/` or release notes.

---

## How to deploy (pinned by sha)

Pinned deploy gives perfect rollback. Use the same sha for backend and worker.

1. Get the sha from the last successful push on `main` (e.g. `abc1234` from GHCR or GitHub Actions), or use a version tag (e.g. `0.1.0` from `git tag v0.1.0`).

2. Edit `docker-compose.prod.yml`:
   ```yaml
   backend:
     image: ghcr.io/<org>/<repo>-backend:sha-abc1234
   worker:
     image: ghcr.io/<org>/<repo>-worker:sha-abc1234
   # Or use version tag: ghcr.io/<org>/<repo>-backend:0.1.0
   # web can stay :latest or pin to sha-abc1234
   ```

3. Deploy:
   ```bash
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml run --rm backend alembic upgrade head
   docker compose -f docker-compose.prod.yml up -d --remove-orphans
   docker image prune -f
   ```

4. Verify:
   ```bash
   curl -sf http://localhost/api/v1/health
   ```

---

## How to rollback

1. Identify the last known-good sha (e.g. from GHCR tags or deploy history).

2. Update `docker-compose.prod.yml`:
   ```yaml
   backend:
     image: ghcr.io/<org>/<repo>-backend:sha-OLDGOOD
   worker:
     image: ghcr.io/<org>/<repo>-worker:sha-OLDGOOD
   ```

3. **Migrations:** If the rollback sha has fewer migrations than current DB, you may need to downgrade:
   ```bash
   docker compose -f docker-compose.prod.yml run --rm backend alembic downgrade -1
   ```
   Or downgrade to a specific revision. Test in staging first.

4. Restart:
   ```bash
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d --remove-orphans
   ```

---

## How to rotate secrets

1. Generate new values (e.g. `SECRET_KEY`, `OPENAI_API_KEY`).

2. Update `.env` on the server (never commit).

3. Restart services to pick up new env:
   ```bash
   docker compose -f docker-compose.prod.yml up -d backend worker web
   ```

4. Invalidate old keys in external services (OpenAI, Firecrawl, etc.) if applicable.

5. If using GitHub secrets for CI: Repo → Settings → Secrets → update.

---

## How to debug healthchecks

### Proxy healthcheck fails

```bash
# From host
curl -v http://localhost/api/v1/health

# From inside proxy container
docker compose -f docker-compose.prod.yml exec proxy wget -qO- http://localhost/api/v1/health
```

If proxy returns 502/504, backend may be down. Check backend logs.

### Backend healthcheck fails

```bash
docker compose -f docker-compose.prod.yml exec backend curl -sf http://localhost:8000/health
docker compose -f docker-compose.prod.yml logs backend
```

### Web healthcheck fails

```bash
docker compose -f docker-compose.prod.yml exec web wget -qO- http://localhost:3000/
docker compose -f docker-compose.prod.yml logs web
```

### Quick status

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=50 backend worker web
```

---

## Links

- [[solutions/DOCKER_GHCR_SETUP]]
- [[testing/e2e/PRE_MERGE_CHECKLIST]]

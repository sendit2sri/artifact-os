# Docker Commands

## Prerequisites

1. **`.env`** in repo root (copy from `.env.example`). For Docker, use sync Postgres URL:
   ```bash
   DATABASE_URL=postgresql://postgres:postgres@db:5432/artifact_dev
   ```
   (Backend uses sync engine; do not use `postgresql+asyncpg` here.)

2. **Optional (E2E / test seed):** In `.env`:
   ```bash
   ARTIFACT_ENABLE_TEST_SEED=true
   ARTIFACT_E2E_MODE=true
   ```

---

## Full stack (proxy + backend + web + db + redis + worker)

From **repo root**:

```bash
# Build and start everything
docker compose up --build

# Or detached (background)
docker compose up -d --build
```

- **App (via proxy):** http://localhost  
- **Backend direct:** http://localhost:8000  
- **Web direct:** http://localhost:3000 (only if you expose 3000; by default only proxy:80)  
- **DB:** localhost:5432 (postgres/postgres, artifact_dev)

Stop:

```bash
docker compose down
```

---

## Backend only (with db + redis)

```bash
docker compose up -d db redis
docker compose up --build backend
```

Backend: http://localhost:8000. Requires `.env` with `DATABASE_URL=postgresql://postgres:postgres@db:5432/artifact_dev`.

---

## Frontend (web) only

Assumes backend is reachable (e.g. via proxy or `BACKEND_URL`). From repo root:

```bash
docker compose up -d db redis backend
docker compose up --build web
```

Or run web alone if backend runs elsewhere; set `NEXT_PUBLIC_API_URL` to the backend base URL (e.g. `http://localhost:8000/api/v1`).

---

## Worker (Celery)

```bash
docker compose up -d db redis backend
docker compose up --build worker
```

---

## Clear all projects (fresh E2E start)

Backend must be running with `ARTIFACT_ENABLE_TEST_SEED=true`.

**If using Docker for backend:**

```bash
curl -X POST http://localhost:8000/api/v1/test/clear_projects
```

Or use the script (backend must be on port 8000):

```bash
BACKEND_URL=http://localhost:8000 ./scripts/clear-test-projects.sh
```

**If using full stack (proxy):** Backend is not on 8000 from host unless you add a port. Either:

- Expose backend in `docker-compose.yml` (e.g. `ports: ["8000:8000"]` on `backend` — already there), then:
  ```bash
  curl -X POST http://localhost:8000/api/v1/test/clear_projects
  ```
- Or exec into the backend container:
  ```bash
  docker compose exec backend curl -s -X POST http://localhost:8000/api/v1/test/clear_projects
  ```

---

## Useful one-liners

| Goal | Command |
|------|---------|
| Full stack, foreground | `docker compose up --build` |
| Full stack, background | `docker compose up -d --build` |
| Stop everything | `docker compose down` |
| Rebuild backend | `docker compose build backend && docker compose up -d backend` |
| Rebuild web | `docker compose build web && docker compose up -d web` |
| Backend logs | `docker compose logs -f backend` |
| Web logs | `docker compose logs -f web` |
| DB shell | `docker compose exec db psql -U postgres -d artifact_dev` |

---

**Tags:** #docs #solutions #docker  
**Related:** [[docs/_index]], [[misc/docs-rules]]

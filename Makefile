.PHONY: init prod dev dev-proxy db-rev db-up down logs clean

init:
	@echo "🛠️  Initializing..."
	cd apps/backend && pip install -r requirements.txt
	cd apps/web && npm install

# --- OPTION 1: PRODUCTION MODE (Docker + Nginx) ---
# ✅ Same-origin routing: /api → backend, / → frontend
# Use this to verify the full system works exactly as in production
prod:
	@echo "🚀 Starting Production Environment..."
	@echo "   - Full stack with Nginx reverse proxy"
	@echo "   - No CORS issues (same-origin)"
	@# Stop any rogue dev servers or containers first
	docker-compose down
	@# Start everything in detached mode
	docker-compose up -d --build
	@echo ""
	@echo "✅ App is Live!"
	@echo "👉 Open: http://localhost:8080"
	@echo "   Frontend: http://localhost:8080 → Nginx → web:3000"
	@echo "   API:      http://localhost:8080/api → Nginx → backend:8000"

# --- OPTION 2: DEV MODE WITH PROXY (Hot Reload + Same Origin) ---
# ✅ RECOMMENDED FOR DEVELOPMENT
# Hot reload for frontend, but still using Nginx for API routing (no CORS)
dev-proxy:
	@echo "🛠️  Starting Dev Environment with Proxy..."
	@echo "   - Frontend hot reload with Nginx routing"
	@echo "   - No CORS issues"
	@# Start all services including proxy
	docker-compose up -d --build
	@echo ""
	@echo "✅ Dev Environment Ready!"
	@echo "👉 Open: http://localhost:8080"
	@echo "   Frontend changes auto-reload"
	@echo "   API calls go through Nginx (same-origin)"
	@echo ""
	@echo "📝 To view logs:"
	@echo "   make logs"

# --- OPTION 3: DEV MODE (Same-Origin via Next.js Rewrites) ---
# ✅ Frontend on :3000 proxies API calls to :8000 via next.config.js rewrites
# No CORS issues - all requests are same-origin from browser perspective
dev:
	@echo "🛠️  Starting Dev Environment (Same-Origin Mode)..."
	@echo "   - Frontend: http://localhost:3000 (with hot reload)"
	@echo "   - Backend:  http://localhost:8000 (proxied via Next.js rewrites)"
	@echo "   - ✅ Same-origin routing (no CORS issues)"
	@# 1. Start Backend & DB, ensure Nginx/Web are stopped to free ports
	docker-compose up -d backend worker db redis
	docker-compose stop proxy web
	@echo ""
	@echo "✅ Backend running on http://localhost:8000"
	@echo "🎨 Starting Frontend with Hot Reload..."
	@echo ""
	@echo "📝 API calls:"
	@echo "   Browser → http://localhost:3000/api/v1/..."
	@echo "   Next.js → http://localhost:8000/api/v1/... (transparent proxy)"
	@echo ""
	@# 2. Run Next.js locally - API_URL defaults to /api/v1, triggering rewrites
	cd apps/web && npm run dev

# --- UTILITIES ---

down:
	@echo "🛑 Stopping all containers..."
	docker-compose down

logs:
	@echo "📋 Tailing logs for backend and worker..."
	@echo "   Press Ctrl+C to exit"
	docker-compose logs -f backend worker

# View all container logs including web and proxy
logs-all:
	@echo "📋 Tailing all logs..."
	docker-compose logs -f

# Check container status
status:
	@echo "📊 Container Status:"
	@docker-compose ps
	@echo ""
	@echo "🌐 Access URLs:"
	@echo "   Production/Dev-Proxy: http://localhost"
	@echo "   Backend (direct):     http://localhost:8000"
	@echo "   Frontend (direct):    http://localhost:3000"
	@echo "   Database:             localhost:5432"

# Create a new DB migration (Usage: make db-rev msg="add_users")
db-rev:
	@if [ -z "$(msg)" ]; then echo "❌ Error: msg is missing. Usage: make db-rev msg='your_message'"; exit 1; fi
	docker-compose exec backend alembic revision --autogenerate -m "$(msg)"
	@# Optional: Fix import style for SQLModel if Alembic defaults to pure SQLAlchemy
	@find apps/backend/alembic/versions -name "*$(msg)*.py" -exec sed -i '' 's/^import sqlalchemy as sa/import sqlalchemy as sa\nimport sqlmodel/' {} +
	@echo "✅ Revision created."

# Apply pending DB migrations
db-up:
	docker-compose exec backend alembic upgrade head

# --- E2E (Playwright in Docker) ---
# Use docker-compose.e2e.yml for production build (next start) — eliminates HMR/Turbopack flake.
COMPOSE_E2E = -f docker-compose.yml -f docker-compose.e2e.yml

# Start stack for E2E (web=production build). No --build by default for speed.
# First time? Run: make e2e-rebuild
e2e-up:
	@echo "🚀 Starting E2E stack (web=production build)..."
	docker compose $(COMPOSE_E2E) up -d proxy backend worker db redis web
	@echo "⏳ Playwright waits for service_healthy; run: make e2e-smoke"

# Rebuild images before starting (use when deps/Dockerfile change)
e2e-rebuild:
	@echo "🔨 Rebuilding E2E stack..."
	docker compose $(COMPOSE_E2E) up -d --build proxy backend worker db redis web
	@echo "⏳ Playwright waits for service_healthy; run: make e2e-smoke"

# Sanity check: proxy and backend must be reachable before running tests
e2e-sanity:
	@echo "🔍 E2E sanity check (proxy + backend)..."
	@docker compose $(COMPOSE_E2E) run --rm playwright bash -lc "curl -sI http://proxy/ | head -1"
	@docker compose $(COMPOSE_E2E) run --rm playwright bash -lc "curl -sI http://backend:8000/health | head -1"
	@echo "✅ Both reachable"

# Run release-gate suite (4–6 core tests, no clipboard). Host wait for proxy 200, then Playwright runs.
e2e-smoke:
	@echo "⏳ Waiting for proxy (web build ~2–5 min)..."
	@i=0; code=000; while [ $$i -lt 120 ]; do \
	  code=$$(curl -s -o /dev/null -w "%{http_code}" http://localhost/ 2>/dev/null || echo "000"); \
	  [ "$$code" = "200" ] && echo "✅ Proxy ready" && break; \
	  echo "  proxy returned $$code"; sleep 2; i=$$((i+1)); \
	done; \
	[ "$$code" = "200" ] || { echo "❌ Proxy never returned 200. Run 'make e2e-up' or 'make e2e-rebuild' first."; exit 1; }
	@echo "⏳ Checking web + API through proxy..."
	@i=0; while [ $$i -lt 30 ]; do \
	  curl -sf http://localhost/ >/dev/null && curl -sf http://localhost/api/v1/health >/dev/null && echo "✅ Web + API ready" && break; \
	  echo "  waiting for web/API"; sleep 2; i=$$((i+1)); \
	done; \
	curl -sf http://localhost/ >/dev/null || { echo "❌ Proxy / never ready."; exit 1; }; \
	curl -sf http://localhost/api/v1/health >/dev/null || { echo "❌ Proxy /api/v1/health never ready. Check backend + nginx."; exit 1; }
	@echo "🚀 Starting Playwright..."
	@docker compose $(COMPOSE_E2E) run --rm playwright || ( \
	  echo ""; echo "❌ Release gate failed."; \
	  echo "   If you see 'dependency failed' or 'unhealthy', run: make e2e-rebuild"; \
	  echo ""; echo "Recent logs:"; \
	  docker compose $(COMPOSE_E2E) logs --tail=40 proxy web backend 2>/dev/null || true; \
	  exit 1 \
	)

# Run Playwright directly (no host wait) — for debugging after e2e-up
e2e-run:
	docker compose $(COMPOSE_E2E) run --rm playwright

# Debug: verify proxy/backend from inside container (run after e2e-up)
e2e-debug:
	docker compose $(COMPOSE_E2E) run --rm playwright bash -lc "curl -sI http://proxy/ | head -3 && curl -sI http://backend:8000/health | head -3"

# Run full E2E suite (manual/nightly only)
e2e-full:
	docker compose $(COMPOSE_E2E) run --rm playwright bash -lc "npm ci && npx playwright install --with-deps && for i in {1..120}; do curl -sf http://proxy/ >/dev/null && break; sleep 2; done && for i in {1..120}; do curl -sf http://backend:8000/health >/dev/null && break; sleep 2; done && npx playwright test -c playwright.config.ts --project=chromium --workers=1"
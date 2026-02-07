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
	@echo "👉 Open: http://localhost"
	@echo "   Frontend: http://localhost → Nginx → web:3000"
	@echo "   API:      http://localhost/api → Nginx → backend:8000"

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
	@echo "👉 Open: http://localhost"
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
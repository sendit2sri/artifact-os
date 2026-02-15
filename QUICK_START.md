# Quick Start Guide

## First Time Setup

```bash
# 1. Install dependencies
make init

# 2. Create .env file (copy from example if available)
cp .env.example .env  # Add your OPENAI_API_KEY

# 3. Start the app
make dev-proxy
```

**Open:** http://localhost:8080

---

## Daily Development Workflow

### Option 1: Full Stack Development (Recommended)
```bash
make dev-proxy
```
- ✅ Hot reload for frontend
- ✅ No CORS issues
- ✅ Matches production exactly
- **Open:** http://localhost:8080

### Option 2: Frontend-Only Development
```bash
make dev
```
- ✅ Fastest hot reload
- ⚠️ Uses CORS (already configured)
- **Open:** http://localhost:3000

### Option 3: Production Test
```bash
make prod
```
- ✅ Full production stack
- **Open:** http://localhost:8080

---

## Common Commands

```bash
make status       # Check what's running
make logs         # View backend logs
make logs-all     # View all logs
make down         # Stop everything

# Database
make db-rev msg="add_users"  # Create migration
make db-up                    # Apply migrations
```

---

## Troubleshooting

### "CORS error in browser"
```bash
# You're probably using http://localhost:3000
# Solution: Use http://localhost:8080 instead
make down
make dev-proxy
```

### "Can't access localhost"
```bash
# Check if containers are running
make status

# If not:
make dev-proxy
```

### "Hot reload not working"
```bash
# Restart with fresh build
make down
make dev-proxy
```

### "Processing stuck on Queued" (URL added but never moves to Fetching)
The Celery worker must be running to process ingested URLs.

```bash
# Ensure full stack (backend + worker + Redis + DB) is running
make down
make dev-proxy   # or: make dev   (both include the worker)
```

If using `npm run dev` in `apps/web` only, the worker is not running. Use `make dev` or `make dev-proxy` instead.

---

## Port Reference

| URL | Service |
|-----|---------|
| http://localhost:8080 | Main app (via Nginx) |
| http://localhost:3000 | Frontend (dev mode only) |
| http://localhost:8000 | Backend API (direct) |

---

**Need more details?** See `ROUTING_ARCHITECTURE.md`

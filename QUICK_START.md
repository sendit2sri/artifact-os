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

**Open:** http://localhost

---

## Daily Development Workflow

### Option 1: Full Stack Development (Recommended)
```bash
make dev-proxy
```
- ✅ Hot reload for frontend
- ✅ No CORS issues
- ✅ Matches production exactly
- **Open:** http://localhost

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
- **Open:** http://localhost

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
# Solution: Use http://localhost instead
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

---

## Port Reference

| URL | Service |
|-----|---------|
| http://localhost | Main app (via Nginx) |
| http://localhost:3000 | Frontend (dev mode only) |
| http://localhost:8000 | Backend API (direct) |

---

**Need more details?** See `ROUTING_ARCHITECTURE.md`

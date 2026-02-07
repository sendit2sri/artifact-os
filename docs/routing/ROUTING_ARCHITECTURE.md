# Routing Architecture & CORS Guide

## TL;DR - How to Run the App

```bash
# 🚀 RECOMMENDED: Use Nginx proxy (no CORS issues)
make dev-proxy    # Hot reload + same-origin routing
# Open http://localhost

# OR for rapid frontend iteration (with CORS)
make dev          # Frontend on :3000, backend on :8000
# Open http://localhost:3000

# OR for full production test
make prod         # Everything containerized behind Nginx
# Open http://localhost
```

---

## Architecture Overview

### Production/Dev-Proxy Mode (Recommended)

```
Browser: http://localhost
         ↓
    [ Nginx :80 ]
         ├─→ / → web:3000 (Next.js)
         └─→ /api → backend:8000 (FastAPI)
```

**Benefits:**
- ✅ Same-origin → No CORS issues
- ✅ Frontend hot reload works (docker volume mount)
- ✅ Matches production routing exactly
- ✅ Rate limiting and security headers via Nginx

**Use Cases:**
- Default development workflow
- Testing full stack integration
- Verifying production behavior

---

### Dev Mode with Direct Backend (CORS Enabled)

```
Browser: http://localhost:3000
         ↓
    [ Next.js :3000 ] ──→ http://localhost:8000/api/v1
                                    ↓
                            [ FastAPI :8000 ]
```

**Trade-offs:**
- ⚠️ Cross-origin → CORS middleware required
- ✅ Faster frontend iteration (no Docker overhead)
- ⚠️ Doesn't match production routing
- ✅ Easy to debug frontend in isolation

**Use Cases:**
- Rapid UI development (hot reload without Docker)
- Frontend-only work
- Debugging CORS issues

---

## Understanding CORS Errors

### Error: "No 'Access-Control-Allow-Origin' header"

**What it means:**
```
Browser:  http://localhost:3000 (frontend)
Request:  http://localhost:8000/api/v1/... (backend)
Problem:  Different port = different origin → CORS check
```

**Why browsers enforce CORS:**
- Security: Prevent malicious sites from stealing data
- Same-origin policy: Protocol + domain + port must match
- `localhost:3000` ≠ `localhost:8000` → Cross-origin request

**How it's fixed:**
1. **Backend adds CORS headers** (already done in `main.py`):
   ```python
   app.add_middleware(
       CORSMiddleware,
       allow_origins=["http://localhost:3000", ...],
       allow_credentials=True,
       allow_methods=["*"],
       allow_headers=["*"],
   )
   ```

2. **Or use Nginx proxy** (recommended):
   - Browser calls `/api/v1/...` (relative URL)
   - Same origin as page → No CORS needed

---

## API URL Configuration

### Frontend (`apps/web/src/lib/api.ts`)

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
```

### How it's set per mode:

| Mode | URL Set By | API_URL Value | CORS Needed? |
|------|-----------|---------------|--------------|
| `make prod` | docker-compose.yml | `/api/v1` | ❌ No |
| `make dev-proxy` | docker-compose.yml | `/api/v1` | ❌ No |
| `make dev` | Makefile env var | `http://localhost:8000/api/v1` | ✅ Yes |

---

## Nginx Configuration Breakdown

### Location Block: `/api/`

```nginx
location /api/ {
    proxy_pass http://backend;  # Points to backend:8000
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

**Routing Flow:**
```
Request:  http://localhost/api/v1/projects
          ↓
Nginx:    Matches /api/ location
          ↓
Proxy:    Forwards to http://backend:8000/api/v1/projects
          ↓
FastAPI:  Receives and processes request
```

### Location Block: `/`

```nginx
location / {
    proxy_pass http://web;  # Points to web:3000
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";  # Enables WebSocket for HMR
}
```

**Hot Module Replacement (HMR):**
- Next.js dev server sends file change events via WebSocket
- Nginx forwards WebSocket connections with `Upgrade` header
- Browser receives updates and hot-reloads components

---

## Common Issues & Fixes

### Issue 1: "CORS error when using localhost:3000"

**Diagnosis:**
```bash
# In Chrome DevTools → Network
Request URL: http://localhost:8000/api/v1/...  ❌ Direct backend call
```

**Fix:** Use `make dev-proxy` instead of `make dev`
```bash
make dev-proxy
# Open http://localhost (not :3000)
```

**Or keep dev mode but verify CORS is working:**
```python
# Check apps/backend/app/main.py has:
allow_origins=["http://localhost:3000", ...]
```

---

### Issue 2: "Hot reload not working in prod/dev-proxy mode"

**Cause:** Volume mount not configured

**Fix:** Verify docker-compose.yml has:
```yaml
web:
  volumes:
    - ./apps/web:/app
    - /app/node_modules  # Persist node_modules in container
```

---

### Issue 3: "Cannot access frontend on localhost"

**Diagnosis:**
```bash
curl http://localhost
# Connection refused
```

**Fix:** Check Nginx is running
```bash
docker-compose ps
# Ensure "proxy" container is "Up"

# If not:
make dev-proxy
```

---

## Decision Matrix: Which Mode to Use?

| Task | Recommended Mode | Why |
|------|-----------------|-----|
| Editing React components | `dev-proxy` | Hot reload + no CORS |
| Adding API endpoints | `dev-proxy` | Test routing + CORS setup |
| Debugging frontend only | `dev` | Faster iteration, direct browser access |
| Testing production build | `prod` | Verifies deployment config |
| Verifying Nginx rules | `prod` or `dev-proxy` | Both use Nginx |
| Working on backend only | `dev` + manual backend | No frontend needed |

---

## Makefile Commands Reference

```bash
# Setup
make init         # Install all dependencies

# Run Modes
make prod         # Full production stack with Nginx
make dev-proxy    # Dev with hot reload + Nginx (recommended)
make dev          # Dev with direct backend (CORS mode)

# Utilities
make status       # Show container status + URLs
make logs         # Tail backend/worker logs
make logs-all     # Tail all container logs
make down         # Stop all containers

# Database
make db-rev msg="description"  # Create new migration
make db-up                     # Apply pending migrations
```

---

## Environment Variables

### Backend (`apps/backend/.env`)
```bash
DATABASE_URL=postgresql://postgres:postgres@db:5432/artifact_dev
REDIS_URL=redis://redis:6379
OPENAI_API_KEY=sk-...
```

### Frontend (set by Makefile/docker-compose)
```bash
# In prod/dev-proxy mode:
NEXT_PUBLIC_API_URL=/api/v1           # Relative URL

# In dev mode (Makefile sets):
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1  # Direct backend
```

---

## Security Notes

### CORS in Production

⚠️ **Never use `allow_origins=["*"]` in production!**

For production deployment:
```python
# apps/backend/app/main.py
ALLOWED_ORIGINS = [
    os.getenv("FRONTEND_URL", "https://yourdomain.com"),
]
```

### Rate Limiting (Nginx)

Already configured in `nginx.conf`:
```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
limit_req zone=api burst=50 nodelay;
```

---

## Debugging Checklist

### When you see CORS errors:

1. **Check which URL the browser is calling**
   ```
   DevTools → Network → Failed request → Headers
   Request URL: http://localhost:8000/...  ← Cross-origin
   ```

2. **Verify your access URL**
   ```
   Browser URL bar: http://localhost:3000   ← Dev mode (CORS needed)
   Browser URL bar: http://localhost        ← Proxy mode (no CORS)
   ```

3. **Confirm CORS middleware is active**
   ```bash
   docker-compose logs backend | grep CORS
   # Should see: "CORS middleware enabled"
   ```

4. **Test with curl to bypass CORS**
   ```bash
   curl -v http://localhost:8000/api/v1/health
   # Should return 200 OK (proves backend works)
   ```

5. **Check preflight requests**
   ```
   DevTools → Network → Look for OPTIONS request before GET/POST
   Status should be 200 with Access-Control-* headers
   ```

---

## Quick Reference: Port Numbers

| Service | Port | Access URL |
|---------|------|------------|
| Nginx (proxy) | 80 | http://localhost |
| Next.js (web) | 3000 | http://localhost:3000 (dev mode only) |
| FastAPI (backend) | 8000 | http://localhost:8000 (direct access) |
| PostgreSQL | 5432 | localhost:5432 |
| Redis | 6379 | localhost:6379 |

---

## Additional Resources

- [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [FastAPI CORS Middleware](https://fastapi.tiangolo.com/tutorial/cors/)
- [Nginx Reverse Proxy Guide](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/)

---

**Last Updated:** February 7, 2026  
**Maintainer:** Architecture Team

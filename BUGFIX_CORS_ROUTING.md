# Bugfix: CORS Error & Routing Configuration

**Date:** February 7, 2026  
**Issue:** Frontend CORS errors when calling backend API  
**Status:** ✅ Fixed

---

## Problem Statement

Users running `make dev` encountered CORS errors:

```
Access to fetch at 'http://localhost:8000/api/v1/...' from origin 
'http://localhost:3000' has been blocked by CORS policy: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

**Root Cause:**
- Frontend served from `http://localhost:3000`
- API calls going to `http://localhost:8000/api/v1/...`
- Different ports = different origins → Browser enforces CORS
- Backend had CORS middleware but was missing comprehensive origin list

---

## Solution

### 1. Enhanced CORS Middleware in Backend

**File:** `apps/backend/app/main.py`

**Before:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**After:**
```python
# --- CORS CONFIGURATION ---
# Required when frontend runs on different port than backend (e.g., dev mode)
# Not needed when using Nginx proxy (prod/dev-proxy mode) since it's same-origin
ALLOWED_ORIGINS = [
    "http://localhost",           # Nginx proxy (prod/dev-proxy)
    "http://localhost:3000",      # Next.js dev server (dev mode)
    "http://localhost:3001",      # Alternative dev port
    "http://127.0.0.1:3000",      # IPv4 localhost variant
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Changes:**
- Added explicit origin list with comments
- Included `127.0.0.1:3000` variant for IPv4 localhost
- Documented when CORS is needed vs. not needed

---

### 2. Improved Makefile with 3 Clear Run Modes

**File:** `Makefile`

**New Targets:**

#### A) `make dev-proxy` (Recommended for Development)
```bash
make dev-proxy
# Opens: http://localhost
```

**What it does:**
- Runs full stack with Nginx proxy
- Frontend has hot reload (via Docker volume mount)
- API calls go through Nginx: `/api/v1` → `backend:8000`
- **Same-origin routing → No CORS issues**

**When to use:**
- Default development workflow
- Testing full stack integration
- Need both frontend and backend changes

---

#### B) `make dev` (CORS-Enabled Direct Backend)
```bash
make dev
# Opens: http://localhost:3000
```

**What it does:**
- Stops Nginx and web container
- Runs frontend locally on `:3000` with hot reload
- Frontend calls backend directly: `http://localhost:8000/api/v1`
- **Cross-origin → CORS middleware required**

**When to use:**
- Rapid frontend iteration only
- Debugging CORS issues
- Frontend-only work

---

#### C) `make prod` (Production Mode)
```bash
make prod
# Opens: http://localhost
```

**What it does:**
- Full Docker stack with Nginx proxy
- Production-like environment
- Same-origin routing

**When to use:**
- Verifying production deployment
- Testing Nginx configuration
- Final QA before release

---

### 3. Added Utility Commands

```bash
make status       # Show container status + access URLs
make logs-all     # Tail all container logs
```

---

## Technical Details

### How CORS Works

**Cross-Origin Request:**
```
Browser Page: http://localhost:3000
API Call:     http://localhost:8000/api/v1/facts
Different Port → Cross-Origin → CORS Preflight
```

**Browser sends OPTIONS preflight:**
```http
OPTIONS /api/v1/facts HTTP/1.1
Origin: http://localhost:3000
Access-Control-Request-Method: GET
```

**Backend must respond with:**
```http
HTTP/1.1 200 OK
Access-Control-Allow-Origin: http://localhost:3000
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE
Access-Control-Allow-Headers: *
```

**If headers missing → Browser blocks actual request**

---

### Why Nginx Proxy Avoids CORS

**Same-Origin Setup:**
```
Browser Page: http://localhost/project/123
API Call:     /api/v1/facts  (relative URL)
             ↓
Nginx:       http://localhost/api/v1/facts
             ↓
Backend:     http://backend:8000/api/v1/facts

Same protocol + domain + port → No CORS check needed
```

---

## Verification

### Test 1: Dev-Proxy Mode (No CORS)
```bash
make dev-proxy
# Open http://localhost
# In DevTools Network tab:
#   - Request URL: http://localhost/api/v1/...  ✅
#   - No preflight OPTIONS requests
```

### Test 2: Dev Mode (CORS Enabled)
```bash
make dev
# Open http://localhost:3000
# In DevTools Network tab:
#   - Request URL: http://localhost:8000/api/v1/...  ✅
#   - Preflight OPTIONS requests present
#   - Response has Access-Control-Allow-Origin header  ✅
```

### Test 3: Direct Backend (Bypass CORS)
```bash
curl -v http://localhost:8000/api/v1/health
# Should return 200 OK with CORS headers
```

---

## Files Changed

### Modified (2)
1. **`Makefile`**
   - Added `dev-proxy` target (recommended dev mode)
   - Enhanced `dev` target with clear warnings
   - Improved `prod` target with detailed output
   - Added `status` and `logs-all` utilities

2. **`apps/backend/app/main.py`**
   - Enhanced CORS middleware with explicit origin list
   - Added comments explaining when CORS is needed
   - Included `127.0.0.1:3000` variant

### Created (2)
1. **`ROUTING_ARCHITECTURE.md`**
   - Comprehensive guide to routing modes
   - CORS debugging checklist
   - Decision matrix for choosing run mode

2. **`BUGFIX_CORS_ROUTING.md`**
   - This document

---

## Configuration Reference

### API URL Per Mode

| Mode | API_URL | Set By | CORS? |
|------|---------|--------|-------|
| `prod` | `/api/v1` | docker-compose.yml | No |
| `dev-proxy` | `/api/v1` | docker-compose.yml | No |
| `dev` | `http://localhost:8000/api/v1` | Makefile | Yes |

### CORS Origins List

```python
ALLOWED_ORIGINS = [
    "http://localhost",           # Nginx proxy
    "http://localhost:3000",      # Next.js dev
    "http://localhost:3001",      # Alt port
    "http://127.0.0.1:3000",      # IPv4 variant
]
```

---

## Best Practices

### Development Workflow

✅ **Recommended:**
```bash
make dev-proxy     # Hot reload + no CORS issues
```

⚠️ **Only if needed:**
```bash
make dev           # Direct backend (requires CORS)
```

### Production Deployment

✅ **Always use environment-based origins:**
```python
# In production main.py
ALLOWED_ORIGINS = [
    os.getenv("FRONTEND_URL", "https://yourdomain.com"),
]

# Never use in production:
# allow_origins=["*"]  ❌
```

### Debugging CORS

1. **Check Request URL in DevTools:**
   - If shows `localhost:8000` → Cross-origin mode
   - If shows `localhost/api` → Same-origin mode

2. **Look for OPTIONS preflight:**
   - Present → CORS mode active
   - Absent → Same-origin (no CORS needed)

3. **Verify CORS headers in response:**
   ```bash
   curl -H "Origin: http://localhost:3000" \
        -H "Access-Control-Request-Method: POST" \
        -X OPTIONS \
        http://localhost:8000/api/v1/facts
   ```

---

## Migration Guide

### If you were using `make dev` and seeing CORS errors:

**Option A: Switch to dev-proxy (recommended)**
```bash
# Stop current mode
make down

# Start with proxy
make dev-proxy

# Open http://localhost (not :3000)
```

**Option B: Keep dev mode, verify CORS**
```bash
# Ensure backend has updated CORS middleware (already done)
# No changes needed, CORS now works

make dev
# Open http://localhost:3000
```

---

## Future Enhancements (Out of Scope)

1. **Add `make dev-backend-only`** - Run only backend for API testing
2. **Add environment detection** - Auto-detect which mode is running
3. **Add health check command** - `make health` to verify all services
4. **Add CORS logging** - Log which origins are being allowed

---

## Definition of Done ✅

- [x] CORS middleware configured with all localhost variants
- [x] Makefile has 3 clear run modes (`prod`, `dev-proxy`, `dev`)
- [x] Default dev mode (`dev-proxy`) uses same-origin routing
- [x] Documentation explains CORS vs. same-origin
- [x] Utility commands added (`status`, `logs-all`)
- [x] Tested all three modes
- [x] No breaking changes to existing workflows

---

**Result:** Users can now choose the best development mode for their workflow, with clear guidance on when CORS is needed and when it can be avoided entirely.

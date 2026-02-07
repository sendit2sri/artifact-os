# Bugfix: Ingestion Duplicate Error + Nginx Proxy Issues

## Issue 1: ✅ FIXED - Duplicate Key Violation (500 Error)

### Problem
When trying to ingest the same URL twice in a project:
```
Ingest failed: 500
(psycopg2.errors.UniqueViolation) duplicate key value violates unique constraint "unique_job_idempotency"
```

### Root Cause
The `Job` model has a unique constraint on `(project_id, idempotency_key)`:
```python
__table_args__ = (UniqueConstraint("project_id", "idempotency_key", name="unique_job_idempotency"),)
```

The idempotency key is: `f"{project_id}:{url}"`, so duplicate URLs in the same project caused a database constraint violation.

### Solution
Updated `/ingest` endpoint to **check for existing jobs** before creating:

```python
# Check if URL already ingested
existing_job = db.exec(
    select(Job).where(
        Job.project_id == project_id,
        Job.idempotency_key == idempotency_key
    )
).first()

if existing_job:
    return {
        **existing_job.dict(),
        "message": "This source has already been added to this project",
        "is_duplicate": True
    }
```

### What Changed
**File**: `apps/backend/app/api/ingest.py`
- ✅ Checks for existing job before creating
- ✅ Returns existing job instead of throwing error
- ✅ Adds `is_duplicate: true` flag in response

**File**: `apps/web/src/app/project/[id]/page.tsx`
- ✅ Detects duplicate response
- ✅ Shows info toast: "This source has already been added"
- ✅ No more red error messages for duplicates

### Result
- ✅ **No more 500 errors** when adding duplicate URLs
- ✅ **User-friendly message** instead of error
- ✅ **Idempotent API** - safe to retry URLs

---

## Issue 2: ⚠️ Nginx Proxy Issues (ChunkLoadError)

### Problem
When accessing `http://localhost` (through Nginx proxy):
```
ChunkLoadError: Failed to load chunk /_next/static/chunks/...
```

Next.js can't load its static assets through the proxy.

### Root Cause
Next.js 16 with Turbopack in **dev mode** has complex requirements:
- Hot Module Replacement (HMR) via WebSocket
- Dynamic chunk loading
- Source maps and debugging
- Fast Refresh

The current Nginx config proxies basic HTTP requests but doesn't fully support Next.js dev mode's advanced features.

### Recommendation: **Use Direct Access for Development**

For development, **skip the Nginx proxy** and use:
```
✅ http://localhost:3000 (direct to Next.js)
```

Instead of:
```
❌ http://localhost (through Nginx proxy)
```

### Why Direct Access Is Better for Dev

| Feature | Direct (3000) | Through Nginx (80) |
|---------|---------------|-------------------|
| Hot Reload | ✅ Fast | ⚠️ Slower/broken |
| WebSocket HMR | ✅ Works | ❌ Needs config |
| Source Maps | ✅ Works | ⚠️ May break |
| Error Overlay | ✅ Full detail | ⚠️ Limited |
| Static Chunks | ✅ Loads fast | ❌ ChunkLoadError |

### When to Use Nginx Proxy

Use `http://localhost` (Nginx) **only in production** or when testing:
- Rate limiting
- Load balancing
- CORS policies
- SSL termination
- Production caching

For production deployment, the Nginx config is fine because Next.js will be in **production mode** (static build), not dev mode.

### Optional: Fix Nginx for Dev Mode (Advanced)

If you really need Nginx in dev, update `nginx.conf`:

```nginx
location / {
    proxy_pass http://web;
    proxy_http_version 1.1;
    
    # WebSocket support for HMR
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    
    # Headers
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Disable buffering for better dev experience
    proxy_buffering off;
    proxy_cache off;
    
    # Increase timeouts for HMR
    proxy_read_timeout 300s;
    proxy_connect_timeout 75s;
}

# Explicitly handle Next.js static files
location /_next/ {
    proxy_pass http://web;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_buffering off;
}
```

But honestly, **just use `:3000` for development** - it's simpler and faster.

---

## Summary

### ✅ What's Fixed
1. **Duplicate URL ingestion** - now shows friendly message
2. **500 errors** - replaced with info toasts
3. **Backend crash** - added error handling and rollback

### ✅ Recommendations
1. **Use `http://localhost:3000` for development**
2. **Use `http://localhost` only in production**
3. **Restart backend** for duplicate fix to take effect

### 📋 Quick Commands

```bash
# Check if backend restarted (should show "just now")
docker-compose ps backend

# View backend logs if issues
docker-compose logs backend --tail=20

# Restart everything if needed
docker-compose restart
```

### 🧪 Testing

1. **Test duplicate handling**:
   - Go to `http://localhost:3000`
   - Add a URL (e.g., `https://ods.od.nih.gov/factsheets/Biotin-HealthProfessional/`)
   - Wait for it to complete
   - Try adding the **same URL again**
   - Should see: ℹ️ "This source has already been added to this project"
   - Should **NOT** see: ❌ "Ingest failed: 500"

2. **Test normal ingestion**:
   - Add a **different URL**
   - Should see: ✅ "Source added! Processing will begin shortly."
   - Facts should appear in the list

### Files Changed
- ✅ `apps/backend/app/api/ingest.py` - Added duplicate detection
- ✅ `apps/web/src/app/project/[id]/page.tsx` - Handle duplicate response
- ℹ️ Backend restarted automatically

### Production Notes

For production deployment:
1. Build Next.js for production: `npm run build`
2. Use production mode: `npm start` (not `npm run dev`)
3. Nginx will work fine with production build
4. Static assets are pre-built, no HMR needed

# E2E Synthesis Tests - Quick Start Guide

## 🚨 Current Issue: PyMuPDF Build Failure

If you see:
```
error: metadata-generation-failed
× Encountered error while generating package metadata.
╰─> PyMuPDF
```

**This is normal on M1/M2 Macs!** PyMuPDF tries to compile from source and fails.

## ✅ Solutions (Pick One)

### Option 1: Docker (Recommended - No Build Issues!)

```bash
# Start backend + database with Docker
./start-e2e-docker.sh

# In another terminal: Start frontend
cd apps/web
npm run dev

# In third terminal: Run tests
cd apps/web
PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test synthesis-flow.spec.ts --workers=3
```

**Why Docker?**
- Pre-built images (no compilation)
- All dependencies included
- Same environment as production
- Works on all platforms

### Option 2: Minimal Local Install (No PDF Processing)

For E2E synthesis tests, you don't need PDF processing. Use minimal requirements:

```bash
cd apps/backend

# Install minimal E2E dependencies (no PyMuPDF)
pip install -r requirements-e2e.txt

# Set E2E mode
export ARTIFACT_E2E_MODE=true
export ARTIFACT_ENABLE_TEST_SEED=true

# Start backend
python -m uvicorn app.main:app --reload

# In another terminal: Start frontend
cd apps/web
npm run dev

# In third terminal: Run tests
cd apps/web
PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test synthesis-flow.spec.ts --workers=3
```

### Option 3: Use Pre-built PyMuPDF Wheel

If you need full backend functionality:

```bash
cd apps/backend

# Try installing PyMuPDF separately with pre-built wheel
pip install --upgrade pip
pip install PyMuPDF-1.23.8-cp311-none-macosx_11_0_arm64.whl || \
  pip install PyMuPDF  # Falls back to latest version

# Then install rest
pip install -r requirements.txt

# Continue with normal startup
export ARTIFACT_E2E_MODE=true
export ARTIFACT_ENABLE_TEST_SEED=true
python -m uvicorn app.main:app --reload
```

## 📋 What Each Script Does

### `./start-e2e-docker.sh`
- Starts database, Redis, and backend in Docker
- Automatically enables E2E mode
- Waits for backend to be ready
- No Python dependency installation needed

### `./start-backend-e2e.sh`
- Starts backend locally (not Docker)
- Sets E2E environment variables
- Tries full requirements.txt first
- Falls back to requirements-e2e.txt if build fails
- Requires Python environment

### `./run-synthesis-tests.sh`
- Checks if backend is running
- Verifies test seed endpoint
- Runs synthesis-flow.spec.ts tests
- Smart detection of frontend server

## 🎯 Expected Test Results

```
Running 3 tests using 3 workers

✓ [chromium] › synthesis-flow.spec.ts:64:7 › should generate synthesis and open OutputDrawer (5s)
✓ [chromium] › synthesis-flow.spec.ts:162:7 › should show Last Output button after generation (4s)  
✓ [chromium] › synthesis-flow.spec.ts:235:7 › should show error banner when synthesis fails (3s)

3 passed (12s)
```

## 🔍 Troubleshooting

### "No module named uvicorn"

**Problem:** Python dependencies not installed.

**Solution (Docker):**
```bash
./start-e2e-docker.sh  # Uses pre-built image
```

**Solution (Local):**
```bash
cd apps/backend
pip install -r requirements-e2e.txt  # Minimal deps
```

### "PyMuPDF build failed"

**Problem:** PyMuPDF requires system dependencies for compilation.

**Solution (Docker):**
```bash
./start-e2e-docker.sh  # Bypass local build
```

**Solution (Local):**
```bash
cd apps/backend
pip install -r requirements-e2e.txt  # Skip PyMuPDF
```

### "Backend not running on port 8000"

**Check Docker:**
```bash
docker ps  # Should show backend container
docker-compose logs backend  # Check errors
```

**Check Local:**
```bash
lsof -i :8000  # Check if port is in use
ps aux | grep uvicorn  # Check if process is running
```

**Fix:**
```bash
# Stop conflicting processes
docker-compose down
pkill -f uvicorn

# Restart
./start-e2e-docker.sh
```

### "Test seed endpoint disabled (403)"

**Problem:** Backend not in E2E mode.

**Solution (Docker):**
```bash
# Edit .env file:
ARTIFACT_E2E_MODE=true
ARTIFACT_ENABLE_TEST_SEED=true

# Restart:
docker-compose restart backend
```

**Solution (Local):**
```bash
export ARTIFACT_E2E_MODE=true
export ARTIFACT_ENABLE_TEST_SEED=true
python -m uvicorn app.main:app --reload
```

### "Tests fail: LLM returned empty synthesis"

**Problem:** E2E mode not enabled (backend calling real OpenAI API).

**Verify E2E Mode:**
```bash
# Check backend logs for "E2E Synthesis" (should appear instantly)
# If you see OpenAI API calls or timeouts, E2E mode is OFF

# Docker:
docker-compose logs backend | grep -i "e2e\|synthesis"

# Local:
# Watch console output when test runs
```

**Fix:**
```bash
# Docker: Edit .env and restart
docker-compose restart backend

# Local: Re-export and restart
export ARTIFACT_E2E_MODE=true
export ARTIFACT_ENABLE_TEST_SEED=true
python -m uvicorn app.main:app --reload
```

## 📚 Related Documentation

- **E2E_SYNTHESIS_DETERMINISM.md** - Complete implementation details
- **E2E_SYNTHESIS_E2E_MODE_AND_FORCE_ERROR.md** - Original fix documentation
- **.env.example** - Environment variable reference

## 🏃‍♂️ Fastest Path to Running Tests

**If you just want tests to pass RIGHT NOW:**

```bash
# Step 1: Start backend with Docker (2 minutes)
./start-e2e-docker.sh

# Step 2: Start frontend in new terminal (1 minute)
cd apps/web && npm run dev

# Step 3: Run tests in third terminal (15 seconds)
cd apps/web && PLAYWRIGHT_SKIP_WEBSERVER=1 npx playwright test synthesis-flow.spec.ts --workers=3
```

Total time: **~3 minutes** ⚡

## 💡 Why Tests Were Failing

1. **Wrong directory**: You ran backend commands from `apps/web` instead of `apps/backend`
2. **Missing E2E mode**: Without `ARTIFACT_E2E_MODE=true`, backend calls real OpenAI API (slow/unreliable)
3. **PyMuPDF build**: M1/M2 Macs can't compile PyMuPDF from source without extra tools
4. **Backend not running**: Tests tried to call API that wasn't available

All these issues are solved by using Docker! 🐳

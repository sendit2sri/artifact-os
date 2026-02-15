# Daily workflow
make dev-proxy    # Start dev with hot reload (no CORS)
make status       # Check what's running
make logs         # View backend logs
make down         # Stop everything

# Database
make db-rev msg="description"
make db-up

# Testing
make prod         # Production-like environment

# Going Forward
After adding model fields, always run:

make db-rev msg="description_of_change"  #Create migration
make db-up                                # Apply migration
docker-compose restart backend            # Restart services


# 🔧 Dev Recovery: Turbopack ChunkLoadError

If you see "ChunkLoadError" or HMR stops working:

## Option 1: Quick Clean (Recommended)
```bash
cd apps/web
npm run dev:clean     # Clears .next/ and restarts dev server
```

## Option 2: Full Recovery (If Quick Clean Fails)
```bash
make down                              # Stop all services
rm -rf apps/web/.next                  # Clear build cache
rm -rf apps/web/node_modules/.cache    # Clear module cache
make dev-proxy                         # Restart with proxy
# Wait 30s for rebuild, then open http://localhost
```

## Option 3: Webpack Fallback (Most Stable)
```bash
cd apps/web
npm run dev:recovery   # Clears cache + uses webpack instead of Turbopack
```

## Available Dev Modes
- `npm run dev` - Default (webpack, stable)
- `npm run dev:turbo` - Turbopack (faster but may have HMR issues)
- `npm run dev:clean` - Auto-clean + default
- `npm run dev:recovery` - Auto-clean + webpack (most stable)
- `npm run dev:webpack` - Force webpack mode

## When to Use Each Mode
- **First time / after pull**: `npm run dev:clean`
- **Random chunk errors**: `npm run dev:recovery`
- **Turbopack issues**: `npm run dev:webpack`
- **Need speed**: `npm run dev:turbo` (experimental)


“Create/update Obsidian docs for the work we just finished. Use docs/**, link in docs/_index.md, no root .md, include ## Links section.”

The process using port 3000 (node PID 15821) was force-killed with kill -9, and the port is now free.
Start the dev server again:
npm run dev -- --port 3000
If port 3000 gets stuck again, use:
9
lsof -i :3000 -t | xargs kill -9
kill -9 sends SIGKILL so the process cannot ignore it.
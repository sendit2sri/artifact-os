# Pre-Merge Checklist

**Use before PR/merge.** No new features—final hardening + verification.

---

## 1. Manual Test Checklist

### Queued Watchdog (real-world behaviors)

- [ ] **Multiple jobs**: 2 pending jobs, one crosses 15s, the other 30s → both render correctly, correct ordering
- [ ] **Job flips state**: PENDING → RUNNING → COMPLETED while timer running → alert auto-dismisses cleanly (no "setState on unmounted")
- [ ] **Retry race**: Spam Retry 3× → button disables, in-flight protection, no duplicate API calls
- [ ] **Retry resets elapsed**: After retry, elapsed resets or clearly shows new attempt
- [ ] **Clock skew**: `created_at` future/missing/invalid → watchdog fails safe (no crash, show nothing or "unknown")
- [ ] **Visibility + CPU**: Leave tab open 5 min → 1s interval cleaned up, no duplicate on re-renders

### Phase machine integrity

- [ ] **Add source flow**: queued → extracting → first facts → phase changes with no flicker
- [ ] **Filter to 0 facts**: Apply filter causing 0 visible facts → phase based on canonical counts, not filtered list

### View state / URL

- [ ] **URL shareability**: Copy URL with filters → open in new tab → identical view
- [ ] **URL cleans**: Clear filters → URL clean (no `?` or `group=off`)
- [ ] **Prefs don’t lock early**: Refresh twice on `/project/:id` with no params → defaults apply consistently

---

## 2. E2E Canary Tests

```bash
npm run test:e2e -- canary.spec.ts
```

Expected: 3 canary tests pass

1. **Prefs hydration canary** – sort/group from server, survives refresh
2. **Watchdog canary** – warning 16s → stuck 31s → dismiss on COMPLETED
3. **URL loop canary** – 5 rapid toggles, no infinite replace

---

## 3. Production Hardening (implemented)

### A) Interval guard (QueuedJobAlert)

- `useEffect` with `return () => clearInterval(id)`
- Empty deps `[]` – no interval multiplication

### B) Retry in-flight protection

- Button disabled while retrying
- Spinner / "Retrying…" state
- On failure: toast + alert stays visible, button re-enables

### C) Safe `created_at` parsing (queuedWatchdog)

- Missing → skip (fail safe)
- Invalid / non-ISO → skip
- Future date → skip
- `formatQueuedTime` returns "unknown" for invalid ms

---

## 4. Jobs keyed by projectId

Verify: `queryKey: ["project-jobs", projectId]` in page.tsx.

- Jobs list scoped to `projectId`
- On navigation, React Query resets for new project
- No stale jobs from previous project in watchdog

---

## 5. Production monitoring (minimum)

Watch for:

- **Client errors (Sentry)**: "Maximum update depth", "setState on unmounted", "Invalid time value"
- **Retry rate**: Spikes → backend queue, not UI
- **Avg time in PENDING**: If growing, watchdog will become noisy

---

## Quick commands

```bash
# Full E2E
npm run test:e2e

# Canary only
npm run test:e2e -- canary.spec.ts

# View state acceptance
npm run test:e2e -- view-state-refactor.spec.ts
```

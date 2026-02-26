# Krisp V1: Media Upload → Whisper → Facts

## Summary

Shipped Krisp V1: audio/video file upload → self-hosted Whisper transcription → transcript persisted → facts extracted via existing pipeline.

## What Changed

| Area | Files |
|------|-------|
| **Backend** | `ingest.py` (media detection, queue task), `ingest_task.py` (ingest_media_task, _resolve_fact_source_url for MEDIA), `transcribe.py` (new), `models.py` (SourceType.MEDIA) |
| **Migration** | `alembic/versions/x7a8b9c0d1e2_add_media_sourcetype.py` |
| **Web** | `AddSourceSheet.tsx`, `SourceTracker.tsx`, `page.tsx` (accept audio/video) |
| **E2E** | `sources-add-media.spec.ts` |
| **Dep** | `faster-whisper` in requirements.txt |

## How to Run

**Backend (with worker):**
```bash
cd apps/backend && pip install -r requirements.txt
# Run migration: alembic upgrade head
uvicorn app.main:app --reload &
celery -A app.workers.celery_app worker -l info
```

**E2E:**
```bash
cd apps/web
ARTIFACT_ENABLE_TEST_SEED=true npx playwright test sources-add-media.spec.ts
```

## Known Limitations

- PDF/txt/md uploads return 400 (media only in V1)
- No file size progress or chunked upload
- Whisper model loads per task (no caching)
- Enum downgrade migration is no-op

## Links

- [[plan/krisp-v1-implementation-plan]]
- [[plan/krisp-intake-and-ux-slices]]

"""Scira query ingest: search → dedup → enqueue URL jobs."""
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any

from sqlmodel import Session, select

from app.models import Job, JobStatus, SourceDoc, SciraUsage
from app.extractors import detect_source_type, normalize_url
from app.workers.celery_app import celery_app
from app.search.provider import SearchResult

JOB_STEP_DONE = "DONE"
SCIRA_RATE_LIMIT_MINUTES = 5
MAX_QUERY_LEN = 500
MAX_URLS_DEFAULT = 5
MAX_URLS_CAP = 5


def _allowed_domains() -> list[str] | None:
    raw = os.environ.get("SCIRA_ALLOWED_DOMAINS")
    if not raw or not raw.strip():
        return None
    return [d.strip().lower() for d in raw.split(",") if d.strip()]


def _domain_allowed(url: str, allowlist: list[str] | None) -> bool:
    if not allowlist:
        return True
    try:
        from urllib.parse import urlparse
        host = (urlparse(url).netloc or "").lower()
        return any(host == d or host.endswith("." + d) for d in allowlist)
    except Exception:
        return False


def run_query_ingest(
    project_id: uuid.UUID,
    workspace_id: uuid.UUID,
    query: str,
    max_urls: int,
    db: Session,
    search_provider: Any,
) -> dict[str, Any]:
    """
    Execute search, dedup URLs, enqueue one url_ingest job per new URL.
    Caller must check feature flag and rate limit before calling.
    """
    query = (query or "").strip()
    if not query:
        raise ValueError("query is required")
    if len(query) > MAX_QUERY_LEN:
        raise ValueError(f"query must be at most {MAX_QUERY_LEN} characters")
    max_urls = max(1, min(max_urls, MAX_URLS_CAP))

    results: list[SearchResult] = search_provider.search(query, limit=max_urls)
    urls = [r.url for r in results if r.url]
    allowlist = _allowed_domains()
    if allowlist:
        urls = [u for u in urls if _domain_allowed(u, allowlist)]
    urls_found = len(urls)

    jobs_created: list[Job] = []
    skipped = 0
    for url in urls:
        source_type = detect_source_type(url)
        canonical = normalize_url(url, source_type)
        idempotency_key = f"{str(project_id)}:{canonical}"

        existing_doc = db.exec(
            select(SourceDoc).where(
                SourceDoc.project_id == project_id,
                SourceDoc.canonical_url == canonical,
            )
        ).first()
        if not existing_doc:
            existing_doc = db.exec(
                select(SourceDoc).where(
                    SourceDoc.project_id == project_id,
                    SourceDoc.url == canonical,
                )
            ).first()
        if existing_doc:
            skipped += 1
            continue

        existing_job = db.exec(
            select(Job).where(
                Job.project_id == project_id,
                Job.idempotency_key == idempotency_key,
            )
        ).first()
        if existing_job:
            skipped += 1
            continue

        job = Job(
            id=uuid.uuid4(),
            project_id=project_id,
            workspace_id=workspace_id,
            type="url_ingest",
            status=JobStatus.PENDING,
            idempotency_key=idempotency_key,
            params={"url": url, "source_type": source_type.value, "canonical_url": canonical},
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        jobs_created.append(job)
        celery_app.send_task("ingest_url", args=[str(job.id), url])

    # Update rate limit
    usage = db.get(SciraUsage, project_id)
    if not usage:
        usage = SciraUsage(project_id=project_id, last_used_at=datetime.now(timezone.utc))
        db.add(usage)
    else:
        usage.last_used_at = datetime.now(timezone.utc)
        db.add(usage)
    db.commit()

    return {
        "query": query,
        "urls_found": urls_found,
        "urls_enqueued": len(jobs_created),
        "urls_skipped_duplicate": skipped,
        "job_ids": [str(j.id) for j in jobs_created],
        "jobs": [j.model_dump() for j in jobs_created],
    }


def check_rate_limit(project_id: uuid.UUID, db: Session) -> None:
    """Raise ValueError with message if project is rate-limited."""
    usage = db.get(SciraUsage, project_id)
    if not usage:
        return
    last = usage.last_used_at
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    delta = datetime.now(timezone.utc) - last
    if delta < timedelta(minutes=SCIRA_RATE_LIMIT_MINUTES):
        raise ValueError("Too many searches. Try again in a few minutes.")

import os
import uuid
import requests
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select
from sqlalchemy.exc import IntegrityError
from app.db.session import get_session
from app.workers.celery_app import celery_app
from app.models import Job, JobStatus, SourceDoc, Project
from app.extractors import detect_source_type, normalize_url
from app.services.scira import run_query_ingest, check_rate_limit
from app.search.tavily import TavilySearchProvider
from app.search.provider import SearchResult

# FastAPI Router
router = APIRouter()

# Standardized steps (must match worker)
JOB_STEP_DONE = "DONE"

def _scira_enabled() -> bool:
    return os.environ.get("SCIRA_QUERY_INGEST_ENABLED", "false").lower() == "true"


SCIRA_USE_MOCK = os.environ.get("SCIRA_USE_MOCK_SEARCH", "false").lower() == "true"


def get_search_provider():
    """Return mock provider when SCIRA_USE_MOCK_SEARCH=true or no TAVILY_API_KEY; else Tavily."""
    if SCIRA_USE_MOCK or not os.environ.get("TAVILY_API_KEY"):
        from app.search.mock import MockSearchProvider
        return MockSearchProvider()
    return TavilySearchProvider()


# Request schemas
class IngestURLRequest(BaseModel):
    project_id: str
    workspace_id: str
    url: str


class IngestQueryRequest(BaseModel):
    workspace_id: str
    query: str
    max_urls: int = 5

# API Endpoints
@router.post("/ingest")
def ingest_url(payload: IngestURLRequest, db: Session = Depends(get_session)):
    """Create a job to ingest a URL (idempotent - dedupe by canonical_url)"""
    try:
        project_uuid = uuid.UUID(payload.project_id)
        source_type = detect_source_type(payload.url)
        canonical = normalize_url(payload.url, source_type)
        idempotency_key = f"{payload.project_id}:{canonical}"

        # Dedupe by existing SourceDoc (canonical_url or url) in project
        existing_doc = db.exec(
            select(SourceDoc).where(
                SourceDoc.project_id == project_uuid,
                SourceDoc.canonical_url == canonical
            )
        ).first()
        if not existing_doc:
            existing_doc = db.exec(
                select(SourceDoc).where(
                    SourceDoc.project_id == project_uuid,
                    SourceDoc.url == canonical
                )
            ).first()
        if not existing_doc and canonical != payload.url:
            existing_doc = db.exec(
                select(SourceDoc).where(
                    SourceDoc.project_id == project_uuid,
                    SourceDoc.url == payload.url
                )
            ).first()

        if existing_doc:
            dup_job = Job(
                id=uuid.uuid4(),
                project_id=project_uuid,
                workspace_id=uuid.UUID(payload.workspace_id),
                type="url_ingest",
                status=JobStatus.COMPLETED,
                idempotency_key=f"{payload.project_id}:dup:{uuid.uuid4()}",
                current_step=JOB_STEP_DONE,
                params={"url": payload.url, "source_type": source_type.value, "canonical_url": canonical},
                result_summary={
                    "is_duplicate": True,
                    "source_id": str(existing_doc.id),
                    "message": "Already added",
                    "source_title": existing_doc.title or canonical,
                },
            )
            db.add(dup_job)
            db.commit()
            db.refresh(dup_job)
            return {
                **dup_job.model_dump(),
                "message": "This source has already been added to this project",
                "is_duplicate": True,
            }

        # Check if a job for this canonical is already queued/running/completed
        existing_job = db.exec(
            select(Job).where(
                Job.project_id == project_uuid,
                Job.idempotency_key == idempotency_key
            )
        ).first()
        
        if existing_job:
            return {
                **existing_job.model_dump(),
                "message": "This source has already been added to this project",
                "is_duplicate": True
            }
        
        # Create new job (params.source_type for sidebar badge before completion)
        job = Job(
            id=uuid.uuid4(),
            project_id=uuid.UUID(payload.project_id),
            workspace_id=uuid.UUID(payload.workspace_id),
            type="url_ingest",
            status=JobStatus.PENDING,
            idempotency_key=idempotency_key,
            params={"url": payload.url, "source_type": source_type.value, "canonical_url": canonical}
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        
        # Queue the Celery task
        celery_app.send_task("ingest_url", args=[str(job.id), payload.url])
        
        return job
    except IntegrityError as e:
        # Handle race condition where duplicate was created between check and insert
        db.rollback()
        if "unique_job_idempotency" in str(e).lower():
            # Find the existing job and return it with duplicate flag
            existing_job = db.exec(
                select(Job).where(
                    Job.project_id == uuid.UUID(payload.project_id),
                    Job.idempotency_key == idempotency_key
                )
            ).first()
            if existing_job:
                return {
                    **existing_job.model_dump(),
                    "message": "This source has already been added to this project",
                    "is_duplicate": True
                }
        # If it's some other integrity error, re-raise
        raise HTTPException(status_code=409, detail="This source has already been added to this project")
    except Exception as e:
        db.rollback()
        # Log the full error but show a user-friendly message
        print(f"Ingest error: {e}")
        raise HTTPException(status_code=500, detail="Failed to add source. Please try again.")

MEDIA_EXTENSIONS = {".mp3", ".wav", ".m4a", ".webm", ".ogg", ".mp4", ".m4v", ".mov"}
MAX_MEDIA_MB = int(os.environ.get("MAX_MEDIA_UPLOAD_MB", "100"))


def _is_media_file(filename: str) -> bool:
    if not filename:
        return False
    parts = filename.rsplit(".", 1)
    ext = ("." + parts[1].lower()) if len(parts) > 1 else ""
    return ext in MEDIA_EXTENSIONS


@router.post("/ingest/file")
async def ingest_file(
    project_id: str,
    workspace_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_session)
):
    """Create a job to ingest an uploaded file (audio/video → transcribe → facts)"""
    try:
        filename = file.filename or "upload"
        if not _is_media_file(filename):
            raise HTTPException(
                status_code=400,
                detail=f"Media only. Supported: {', '.join(sorted(MEDIA_EXTENSIONS))}",
            )

        contents = await file.read()
        size_mb = len(contents) / (1024 * 1024)
        if size_mb > MAX_MEDIA_MB:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Max {MAX_MEDIA_MB}MB.",
            )

        upload_dir = "/tmp/research_uploads"
        os.makedirs(upload_dir, exist_ok=True)
        file_path = os.path.join(upload_dir, filename)

        with open(file_path, "wb") as f:
            f.write(contents)

        job = Job(
            id=uuid.uuid4(),
            project_id=uuid.UUID(project_id),
            workspace_id=uuid.UUID(workspace_id),
            type="file_ingest",
            status=JobStatus.PENDING,
            idempotency_key=f"{project_id}:file:{filename}",
            params={"filename": filename, "path": file_path, "source_type": "MEDIA"},
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        celery_app.send_task("ingest_media", args=[str(job.id)])
        return job
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_id}/ingest/query")
def ingest_query(
    project_id: str,
    payload: IngestQueryRequest,
    db: Session = Depends(get_session),
    search_provider=Depends(get_search_provider),
):
    """Search by query, enqueue up to N URLs into ingest pipeline (feature-flagged, rate-limited)."""
    if not _scira_enabled():
        raise HTTPException(
            status_code=403,
            detail="Query search is not enabled.",
        )
    try:
        project_uuid = uuid.UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project_id")
    project = db.get(Project, project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        workspace_uuid = uuid.UUID(payload.workspace_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid workspace_id")
    if not (payload.query or "").strip():
        raise HTTPException(status_code=400, detail="query is required")
    if len(payload.query) > 500:
        raise HTTPException(status_code=400, detail="query must be at most 500 characters")
    max_urls = max(1, min(payload.max_urls, 5))
    try:
        check_rate_limit(project_uuid, db)
    except ValueError as e:
        raise HTTPException(status_code=429, detail=str(e))
    try:
        result = run_query_ingest(
            project_id=project_uuid,
            workspace_id=workspace_uuid,
            query=payload.query.strip(),
            max_urls=max_urls,
            db=db,
            search_provider=search_provider,
        )
        return result
    except ValueError as e:
        msg = str(e)
        if "query" in msg.lower():
            raise HTTPException(status_code=400, detail=msg)
        raise HTTPException(status_code=400, detail=msg)
    except (requests.exceptions.RequestException, requests.exceptions.HTTPError) as e:
        print(f"Scira search provider error: {e}")
        raise HTTPException(
            status_code=503,
            detail="Search is temporarily unavailable. Try again later.",
        )
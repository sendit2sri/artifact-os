import uuid
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select
from sqlalchemy.exc import IntegrityError
from app.db.session import get_session
from app.workers.celery_app import celery_app
from app.models import Job, JobStatus, SourceDoc
from app.extractors import detect_source_type, normalize_url

# FastAPI Router
router = APIRouter()

# Standardized steps (must match worker)
JOB_STEP_DONE = "DONE"

# Request schemas
class IngestURLRequest(BaseModel):
    project_id: str
    workspace_id: str
    url: str

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
                    "message": "Already added",
                    "source_title": existing_doc.title or canonical,
                },
            )
            db.add(dup_job)
            db.commit()
            db.refresh(dup_job)
            return {
                **dup_job.dict(),
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
                **existing_job.dict(),
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
                    **existing_job.dict(),
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

@router.post("/ingest/file")
async def ingest_file(
    project_id: str,
    workspace_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_session)
):
    """Create a job to ingest an uploaded file"""
    try:
        # Save file temporarily
        import os
        upload_dir = "/tmp/research_uploads"
        os.makedirs(upload_dir, exist_ok=True)
        file_path = os.path.join(upload_dir, file.filename or "upload.txt")
        
        contents = await file.read()
        with open(file_path, "wb") as f:
            f.write(contents)
        
        job = Job(
            id=uuid.uuid4(),
            project_id=uuid.UUID(project_id),
            workspace_id=uuid.UUID(workspace_id),
            type="file_ingest",
            status=JobStatus.PENDING,
            idempotency_key=f"{project_id}:{file.filename}",
            params={"filename": file.filename, "path": file_path}
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        
        # Queue processing task (you'd need to create this)
        # celery_app.send_task("ingest_file", args=[str(job.id), file_path])
        
        return job
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
import uuid
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select
from sqlalchemy.exc import IntegrityError
from app.db.session import get_session
from app.workers.celery_app import celery_app
from app.models import Job, JobStatus

# FastAPI Router
router = APIRouter()

# Request schemas
class IngestURLRequest(BaseModel):
    project_id: str
    workspace_id: str
    url: str

# API Endpoints
@router.post("/ingest")
def ingest_url(payload: IngestURLRequest, db: Session = Depends(get_session)):
    """Create a job to ingest a URL (idempotent - won't create duplicates)"""
    try:
        idempotency_key = f"{payload.project_id}:{payload.url}"
        
        # Check if this URL was already ingested for this project
        existing_job = db.exec(
            select(Job).where(
                Job.project_id == uuid.UUID(payload.project_id),
                Job.idempotency_key == idempotency_key
            )
        ).first()
        
        if existing_job:
            # URL already ingested - return existing job instead of error
            return {
                **existing_job.dict(),
                "message": "This source has already been added to this project",
                "is_duplicate": True
            }
        
        # Create new job
        job = Job(
            id=uuid.uuid4(),
            project_id=uuid.UUID(payload.project_id),
            workspace_id=uuid.UUID(payload.workspace_id),
            type="url_ingest",
            status=JobStatus.PENDING,
            idempotency_key=idempotency_key,
            params={"url": payload.url}
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
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from sqlmodel import Session, select, SQLModel
from app.api import ingest, projects, sources, test_helpers, workspaces
from app.models import ResearchNode, ReviewStatus, Job, Workspace, SciraUsage
from app.db.session import engine
import os
import uuid
import json


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables + seed dev workspace
    SQLModel.metadata.create_all(engine)
    with Session(engine) as db:
        dev_ws_id = uuid.UUID("123e4567-e89b-12d3-a456-426614174000")
        existing = db.get(Workspace, dev_ws_id)
        if not existing:
            print("🌱 Seeding Dev Workspace...")
            ws = Workspace(id=dev_ws_id, name="Dev Workspace", settings={})
            db.add(ws)
            db.commit()
            print("✅ Dev Workspace Ready.")
    yield
    # Shutdown: nothing to do


app = FastAPI(title="Artifact OS API", lifespan=lifespan)

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

# --- GLOBAL ERROR LOGGING ---
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    print(f"❌ VALIDATION ERROR at {request.url}:")
    print(json.dumps(exc.errors(), indent=2)) 
    body = await request.body()
    print(f"📥 Received Body: {body.decode()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": body.decode()},
    )

@app.get("/health")
def health_check():
    return {"status": "ok", "system": "Artifact OS"}


@app.get("/api/v1/health")
def api_health():
    return {"ok": True}

# --- ROUTERS ---
app.include_router(projects.router, prefix="/api/v1", tags=["Projects"])
app.include_router(ingest.router,   prefix="/api/v1", tags=["Ingestion"])
app.include_router(sources.router,  prefix="/api/v1", tags=["Sources"])
app.include_router(test_helpers.router, prefix="/api/v1", tags=["Test Helpers"])
app.include_router(workspaces.router, prefix="/api/v1", tags=["Workspaces"])

# Ensure temp directory exists
UPLOAD_DIR = "/tmp/research_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# --- GLOBAL SCHEMAS ---

class UpdateFactRequest(BaseModel):
    fact_text: Optional[str] = None
    is_key_claim: Optional[bool] = None
    review_status: Optional[ReviewStatus] = None
    is_pinned: Optional[bool] = None

class BatchUpdateFactsRequest(BaseModel):
    fact_ids: List[str]
    updates: UpdateFactRequest

class UpdateJobRequest(BaseModel):
    summary: Optional[str] = None
    source_title: Optional[str] = None

# --- GLOBAL ENDPOINTS (Facts/Jobs) ---

@app.patch("/api/v1/facts/{fact_id}")
def update_fact(fact_id: str, payload: UpdateFactRequest):
    with Session(engine) as db:
        fact = db.get(ResearchNode, fact_id)
        if not fact:
            raise HTTPException(status_code=404, detail="Fact not found")

        if payload.fact_text is not None:
            fact.fact_text = payload.fact_text
        if payload.is_key_claim is not None:
            fact.is_key_claim = payload.is_key_claim
        if payload.is_pinned is not None:
            fact.is_pinned = payload.is_pinned

        # ✅ STEP #7: Respect manual review_status override
        # If user explicitly sets review_status, always honor it (even for low confidence)
        if payload.review_status is not None:
            fact.review_status = payload.review_status

        db.add(fact)
        db.commit()
        db.refresh(fact)
        return fact

@app.post("/api/v1/facts/batch")
def batch_update_facts(payload: BatchUpdateFactsRequest):
    with Session(engine) as db:
        statement = select(ResearchNode).where(ResearchNode.id.in_(payload.fact_ids))
        results = db.exec(statement).all()
        
        for fact in results:
            if payload.updates.fact_text is not None:
                fact.fact_text = payload.updates.fact_text
            if payload.updates.is_key_claim is not None:
                fact.is_key_claim = payload.updates.is_key_claim
            if payload.updates.review_status is not None:
                fact.review_status = payload.updates.review_status
            if payload.updates.is_pinned is not None:
                fact.is_pinned = payload.updates.is_pinned
            db.add(fact)
            
        db.commit()
        return {"count": len(results), "ok": True}

@app.delete("/api/v1/facts/{fact_id}")
def delete_fact(fact_id: str):
    with Session(engine) as db:
        fact = db.get(ResearchNode, fact_id)
        if not fact:
            raise HTTPException(status_code=404, detail="Fact not found")
        db.delete(fact)
        db.commit()
        return {"ok": True}

@app.patch("/api/v1/jobs/{job_id}")
def update_job(job_id: str, payload: UpdateJobRequest):
    with Session(engine) as db:
        job = db.get(Job, job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        from sqlalchemy.orm.attributes import flag_modified
        if payload.summary is not None:
            job.result_summary = job.result_summary or {}
            job.result_summary["summary"] = payload.summary
            flag_modified(job, "result_summary")
        
        if payload.source_title is not None:
            job.result_summary = job.result_summary or {}
            job.result_summary["source_title"] = payload.source_title
            flag_modified(job, "result_summary")
            
        db.add(job)
        db.commit()
        db.refresh(job)
        return job
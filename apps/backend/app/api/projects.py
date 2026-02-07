import os
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlmodel import Session, select, desc, delete
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime

from app.db.session import get_session
from app.models import Project, Job, ResearchNode, Workspace, SourceDoc, Output

router = APIRouter()

# --- SCHEMAS ---

class ProjectCreate(BaseModel):
    title: str
    workspace_id: UUID

class ProjectRead(BaseModel):
    id: UUID
    title: str
    workspace_id: UUID
    created_at: Any

class FactInput(BaseModel):
    id: str
    text: str
    title: str = "Unknown"
    url: str = ""
    section: Optional[str] = None

class SynthesisRequest(BaseModel):
    facts: List[FactInput]
    mode: str = "paragraph"

class AnalysisResponse(BaseModel):
    clusters: List[Dict]

# --- ENDPOINTS ---

@router.post("/projects", response_model=ProjectRead)
def create_project(project: ProjectCreate, db: Session = Depends(get_session)):
    new_project = Project(
        title=project.title,
        workspace_id=project.workspace_id,
        storage_path_root=f"projects/{project.title.lower().replace(' ', '_')}"
    )
    db.add(new_project)
    db.commit()
    db.refresh(new_project)
    return new_project

@router.get("/projects/{project_id}", response_model=ProjectRead)
def get_project(project_id: str, db: Session = Depends(get_session)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

class ProjectUpdate(BaseModel):
    title: Optional[str] = None

@router.patch("/projects/{project_id}", response_model=ProjectRead)
def update_project(project_id: str, update: ProjectUpdate, db: Session = Depends(get_session)):
    """Update project details"""
    project = db.get(Project, UUID(project_id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if update.title is not None:
        project.title = update.title
    
    db.add(project)
    db.commit()
    db.refresh(project)
    return project

@router.post("/projects/{project_id}/reset")
def reset_project(project_id: str, db: Session = Depends(get_session)):
    try:
        p_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID")

    # Delete in order of dependencies
    db.exec(delete(ResearchNode).where(ResearchNode.project_id == p_uuid))
    db.exec(delete(Job).where(Job.project_id == p_uuid))
    db.exec(delete(SourceDoc).where(SourceDoc.project_id == p_uuid))
    
    db.commit()
    return {"status": "ok", "message": "Project reset successfully"}

@router.get("/projects/{project_id}/facts")
def get_project_facts(
    project_id: str, 
    review_status: Optional[str] = None,
    filter: Optional[str] = None,  # all | needs_review | key_claims | approved | flagged | rejected
    sort: Optional[str] = None,    # newest | confidence | key_claims
    order: Optional[str] = "desc", # asc | desc
    db: Session = Depends(get_session)
):
    """
    Get project facts with filtering and sorting (STEP #8).
    
    Args:
        project_id: Project UUID
        review_status: Legacy filter (deprecated - use 'filter' param)
        filter: Filter type (all, needs_review, key_claims, approved, flagged, rejected)
        sort: Sort by (newest, confidence, key_claims)
        order: Sort order (asc, desc)
    """
    statement = select(ResearchNode).where(ResearchNode.project_id == UUID(project_id))
    
    # ✅ STEP #8: Apply filters
    # Support legacy review_status param for backward compatibility
    active_filter = filter or review_status
    
    if active_filter:
        from app.models import ReviewStatus
        
        # Map filter strings to review statuses
        filter_mapping = {
            "needs_review": ReviewStatus.NEEDS_REVIEW,
            "approved": ReviewStatus.APPROVED,
            "flagged": ReviewStatus.FLAGGED,
            "rejected": ReviewStatus.REJECTED,
            "pending": ReviewStatus.PENDING,
        }
        
        if active_filter == "all":
            # No filter, show all
            pass
        elif active_filter == "key_claims":
            # Show only key claims
            statement = statement.where(ResearchNode.is_key_claim == True)
        elif active_filter in filter_mapping:
            # Filter by review status
            statement = statement.where(ResearchNode.review_status == filter_mapping[active_filter])
        else:
            raise HTTPException(status_code=400, detail=f"Invalid filter: {active_filter}")
    
    # ✅ STEP #8: Apply sorting
    if sort == "confidence":
        # Sort by confidence score
        if order == "asc":
            statement = statement.order_by(ResearchNode.confidence_score.asc())
        else:
            statement = statement.order_by(ResearchNode.confidence_score.desc())
    elif sort == "key_claims":
        # Show key claims first, then by created_at
        statement = statement.order_by(
            ResearchNode.is_key_claim.desc(),
            ResearchNode.created_at.desc()
        )
    else:
        # Default: newest first
        if order == "asc":
            statement = statement.order_by(ResearchNode.created_at.asc())
        else:
            statement = statement.order_by(ResearchNode.created_at.desc())
    
    results = db.exec(statement).all()
    
    # Join with source docs to get domain/url
    facts_with_source = []
    for fact in results:
        source = db.get(SourceDoc, fact.source_doc_id)
        facts_with_source.append({
            **fact.dict(),
            "source_domain": source.domain if source else "Unknown",
            "source_url": source.url if source else ""
        })
        
    return facts_with_source

@router.get("/projects/{project_id}/jobs")
def get_project_jobs(project_id: str, db: Session = Depends(get_session)):
    statement = select(Job).where(Job.project_id == UUID(project_id)).order_by(desc(Job.created_at))
    results = db.exec(statement).all()
    return results

@router.delete("/projects/{project_id}/jobs/{job_id}")
def delete_job(project_id: str, job_id: str, delete_facts: bool = False, db: Session = Depends(get_session)):
    """
    Delete a job and optionally its associated facts and source doc.
    
    Args:
        project_id: Project UUID
        job_id: Job UUID
        delete_facts: If True, also delete associated ResearchNodes and SourceDoc
    """
    try:
        p_uuid = UUID(project_id)
        j_uuid = UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID")
    
    # Get the job
    job = db.get(Job, j_uuid)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.project_id != p_uuid:
        raise HTTPException(status_code=403, detail="Job does not belong to this project")
    
    if delete_facts:
        # Find the source doc associated with this job (by URL)
        url = job.params.get("url")
        if url:
            source_doc = db.exec(
                select(SourceDoc).where(
                    SourceDoc.project_id == p_uuid,
                    SourceDoc.url == url
                )
            ).first()
            
            if source_doc:
                # Delete facts associated with this source
                db.exec(delete(ResearchNode).where(ResearchNode.source_doc_id == source_doc.id))
                # Delete the source doc
                db.delete(source_doc)
    
    # Delete the job
    db.delete(job)
    db.commit()
    
    return {"status": "ok", "message": "Job deleted successfully"}

# --- AI ENDPOINTS (Moved here from main.py) ---

@router.post("/projects/{project_id}/analyze")
def analyze_facts(project_id: str, payload: SynthesisRequest):
    try:
        fact_dicts = [f.dict() for f in payload.facts]
        from app.services.llm import analyze_selection
        clusters = analyze_selection(fact_dicts)
        return AnalysisResponse(clusters=clusters)
    except Exception as e:
        print(f"Analysis Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def _e2e_mode_enabled() -> bool:
    """True when E2E/test mode is on: deterministic synthesis, no real LLM."""
    e2e = os.environ.get("ARTIFACT_E2E_MODE", "").lower() == "true"
    seed = os.environ.get("ARTIFACT_ENABLE_TEST_SEED", "").lower() == "true"
    return e2e or seed


def _build_e2e_synthesis(payload: SynthesisRequest) -> str:
    """Deterministic synthesis text for E2E: title, bullet list of facts, sources count, mode."""
    lines = ["E2E Synthesis"]
    lines.append("")
    for f in payload.facts:
        lines.append(f"- {f.text}")
    lines.append("")
    sources = len(set(f.url for f in payload.facts if f.url))
    lines.append(f"Sources: {sources} | Mode: {payload.mode}")
    return "\n".join(lines)


@router.post("/projects/{project_id}/synthesize")
def synthesize_project_facts(
    project_id: str,
    payload: SynthesisRequest,
    force_error: bool = False,
    db: Session = Depends(get_session),
):
    """
    Generate synthesis from selected facts.

    CANONICAL RESPONSE CONTRACT:
    Success: {"synthesis": str, "output_id": str (UUID), "clusters": Optional[list]}
    Error: 502 with body {detail: str, code: "EMPTY_SYNTHESIS"} or 500 for other errors

    E2E TEST MODE (ARTIFACT_E2E_MODE or ARTIFACT_ENABLE_TEST_SEED):
    Returns deterministic synthesis without calling external LLM.
    Query param force_error=true (E2E only) simulates empty synthesis for error-handling tests.
    """
    try:
        fact_dicts = [f.dict() for f in payload.facts]
        e2e = _e2e_mode_enabled()

        # E2E + force_error: simulate empty synthesis for error test (no 500)
        if e2e and force_error:
            return JSONResponse(
                status_code=502,
                content={"detail": "LLM returned empty synthesis", "code": "EMPTY_SYNTHESIS"},
                headers={"X-Error-Code": "EMPTY_SYNTHESIS"},
            )

        if e2e:
            synthesis_text = _build_e2e_synthesis(payload)
            result = {"synthesis": synthesis_text, "clusters": []}
        else:
            from app.services.llm import synthesize_facts as llm_synthesize
            result = llm_synthesize(fact_dicts, payload.mode)

        synthesis_raw = result.get("synthesis", "")
        if isinstance(synthesis_raw, list):
            synthesis_text = "\n\n".join(str(s) for s in synthesis_raw if s)
        elif isinstance(synthesis_raw, str):
            synthesis_text = synthesis_raw
        else:
            synthesis_text = str(synthesis_raw)

        if not synthesis_text.strip():
            return JSONResponse(
                status_code=502,
                content={"detail": "LLM returned empty synthesis", "code": "EMPTY_SYNTHESIS"},
                headers={"X-Error-Code": "EMPTY_SYNTHESIS"},
            )

        mode_titles = {"paragraph": "Synthesis", "outline": "Script Outline", "brief": "Research Brief"}
        title = f"{mode_titles.get(payload.mode, 'Output')} - {datetime.utcnow().strftime('%b %d, %Y at %I:%M %p')}"

        output = Output(
            project_id=UUID(project_id),
            title=title,
            content=synthesis_text,
            output_type="synthesis",
            mode=payload.mode,
            fact_ids=[f.id for f in payload.facts],
            source_count=len(set(f.url for f in payload.facts if f.url)),
        )
        db.add(output)
        db.commit()
        db.refresh(output)

        return {
            "synthesis": synthesis_text,
            "output_id": str(output.id),
            "clusters": result.get("clusters", []),
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Synthesis Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Synthesis generation failed: {str(e)}",
            headers={"X-Error-Code": "SYNTHESIS_EXCEPTION"},
        )

@router.get("/projects/{project_id}/outputs")
def get_project_outputs(project_id: str, db: Session = Depends(get_session)):
    """Get all outputs for a project"""
    statement = select(Output).where(Output.project_id == UUID(project_id)).order_by(desc(Output.created_at))
    results = db.exec(statement).all()
    return results

@router.get("/outputs/{output_id}")
def get_output(output_id: str, db: Session = Depends(get_session)):
    """Get a specific output"""
    output = db.get(Output, UUID(output_id))
    if not output:
        raise HTTPException(status_code=404, detail="Output not found")
    return output

@router.delete("/outputs/{output_id}")
def delete_output(output_id: str, db: Session = Depends(get_session)):
    """Delete an output"""
    output = db.get(Output, UUID(output_id))
    if not output:
        raise HTTPException(status_code=404, detail="Output not found")
    db.delete(output)
    db.commit()
    return {"status": "ok", "message": "Output deleted"}
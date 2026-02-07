"""
Test Helper Endpoints
ONLY enabled when ARTIFACT_ENABLE_TEST_SEED=true
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlmodel import Session, select, delete
from uuid import UUID, uuid4
from pydantic import BaseModel
from typing import Optional
import os

from app.db.session import get_session
from app.models import Workspace, Project, SourceDoc, ResearchNode, NodeType, ReviewStatus, IntegrityStatus, Output

router = APIRouter()

# Default test fixture IDs (used when not provided)
DEFAULT_WORKSPACE_ID = UUID("123e4567-e89b-12d3-a456-426614174000")
DEFAULT_PROJECT_ID = UUID("123e4567-e89b-12d3-a456-426614174001")
DEFAULT_SOURCE_ID = UUID("123e4567-e89b-12d3-a456-426614174002")

def is_test_seed_enabled():
    """Check if test seed endpoints are enabled"""
    return os.getenv("ARTIFACT_ENABLE_TEST_SEED", "false").lower() == "true"

class SeedRequest(BaseModel):
    """Optional parameters for test seeding (parallel-safe)"""
    project_id: Optional[str] = None  # If provided, use this UUID; else generate new
    source_id: Optional[str] = None   # If provided, use this UUID; else generate new
    facts_count: Optional[int] = 3    # Number of facts to create (default 3)
    reset: Optional[bool] = True      # If true, delete existing records first (idempotent)

@router.post("/test/seed")
def seed_test_data(payload: SeedRequest = SeedRequest(), db: Session = Depends(get_session)):
    """
    Seed deterministic test data for E2E tests (parallel-safe).
    
    Accepts optional payload:
    - project_id: Use specific UUID (for worker isolation) or generate new
    - source_id: Use specific UUID or generate new
    - facts_count: Number of facts to create (default 3)
    - reset: Delete existing records first for idempotency (default true)
    
    ✅ PARALLEL-SAFE: Each worker can use unique project_id
    ✅ IDEMPOTENT: reset=true ensures clean state
    
    Returns the actual IDs used (for Playwright to reference).
    """
    if not is_test_seed_enabled():
        raise HTTPException(
            status_code=403, 
            detail="Test seed endpoint disabled. Set ARTIFACT_ENABLE_TEST_SEED=true"
        )
    
    try:
        # Determine IDs (use provided or generate new)
        workspace_id = DEFAULT_WORKSPACE_ID  # Always use same workspace
        project_id = UUID(payload.project_id) if payload.project_id else uuid4()
        source_id = UUID(payload.source_id) if payload.source_id else uuid4()
        facts_count = payload.facts_count or 3
        
        print(f"🌱 Seeding test data: project={project_id}, source={source_id}, facts={facts_count}, reset={payload.reset}")
        
        # Optional: Reset existing data for idempotency
        if payload.reset:
            # Delete in dependency order: facts → outputs → source → project
            db.exec(delete(ResearchNode).where(ResearchNode.project_id == project_id))
            db.exec(delete(Output).where(Output.project_id == project_id))
            db.exec(delete(SourceDoc).where(SourceDoc.id == source_id))
            db.exec(delete(Project).where(Project.id == project_id))
            db.flush()
        
        # Sample content for source doc
        sample_content = """Climate Change Research Summary

Recent studies indicate that global temperatures have risen by approximately 1.1°C since pre-industrial times. This warming trend is primarily driven by human activities, particularly the emission of greenhouse gases.

Key Findings:
- Arctic sea ice has declined by 13% per decade since 1979
- Ocean acidification has increased by 30% since industrial revolution
- Extreme weather events are becoming more frequent and severe

The Paris Agreement aims to limit warming to well below 2°C, preferably 1.5°C, compared to pre-industrial levels. However, current national commitments fall short of this target.

Scientists emphasize the need for immediate action to reduce emissions and transition to renewable energy sources. The next decade is critical for determining future climate trajectories."""
        
        # 1. Upsert workspace (always reuse default for all tests)
        workspace = db.get(Workspace, workspace_id)
        if not workspace:
            workspace = Workspace(
                id=workspace_id,
                name="Test Workspace",
                settings={}
            )
            db.add(workspace)
            db.flush()
        
        # 2. Create project (fresh after reset)
        project = Project(
            id=project_id,
            workspace_id=workspace_id,
            title=f"Test Project - E2E ({str(project_id)[:8]})",
            storage_path_root=f"test/e2e/{str(project_id)[:8]}"
        )
        db.add(project)
        db.flush()
        
        # 3. Create source doc
        source = SourceDoc(
            id=source_id,
            project_id=project_id,
            workspace_id=workspace_id,
            url="https://example.com/climate-research",
            domain="example.com",
            title="Climate Change Research Summary",
            content_text=sample_content,
            content_text_raw=sample_content,
            content_markdown=sample_content
        )
        db.add(source)
        db.flush()
        
        # 4. Create facts (up to facts_count, max 3)
        facts_to_create = min(facts_count, 3)
        
        # Fact 1: High confidence, approved
        if facts_to_create >= 1:
            quote1 = "global temperatures have risen by approximately 1.1°C since pre-industrial times"
            start1 = sample_content.find(quote1)
            fact1 = ResearchNode(
                project_id=project_id,
                source_doc_id=source_id,
            type=NodeType.FACT,
            fact_text="Global temperatures have risen by approximately 1.1°C since pre-industrial times",
            quote_text_raw=quote1,
            evidence_start_char_raw=start1 if start1 != -1 else None,
            evidence_end_char_raw=start1 + len(quote1) if start1 != -1 else None,
            confidence_score=95,
            integrity_status=IntegrityStatus.VERIFIED,
            review_status=ReviewStatus.APPROVED,
            is_key_claim=True
            )
            db.add(fact1)
        
        # Fact 2: Low confidence, needs review
        if facts_to_create >= 2:
            quote2 = "Arctic sea ice has declined by 13% per decade since 1979"
            start2 = sample_content.find(quote2)
            fact2 = ResearchNode(
                project_id=project_id,
                source_doc_id=source_id,
            type=NodeType.FACT,
            fact_text="Arctic sea ice has declined by 13% per decade since 1979",
            quote_text_raw=quote2,
            evidence_start_char_raw=start2 if start2 != -1 else None,
            evidence_end_char_raw=start2 + len(quote2) if start2 != -1 else None,
            confidence_score=65,
            integrity_status=IntegrityStatus.NEEDS_REVIEW,
            review_status=ReviewStatus.NEEDS_REVIEW,
            is_key_claim=False
            )
            db.add(fact2)
        
        # Fact 3: High confidence, pending
        if facts_to_create >= 3:
            quote3 = "Ocean acidification has increased by 30% since industrial revolution"
            start3 = sample_content.find(quote3)
            fact3 = ResearchNode(
                project_id=project_id,
                source_doc_id=source_id,
            type=NodeType.FACT,
            fact_text="Ocean acidification has increased by 30% since industrial revolution",
            quote_text_raw=quote3,
            evidence_start_char_raw=start3 if start3 != -1 else None,
            evidence_end_char_raw=start3 + len(quote3) if start3 != -1 else None,
            confidence_score=88,
            integrity_status=IntegrityStatus.VERIFIED,
            review_status=ReviewStatus.PENDING,
            is_key_claim=True
            )
            db.add(fact3)
        
        # Commit transaction
        db.commit()
        
        return {
            "status": "ok",
            "message": "Test data seeded successfully",
            "workspace_id": str(workspace_id),
            "project_id": str(project_id),
            "source_id": str(source_id),
            "facts_count": facts_to_create
        }
    
    except Exception as e:
        db.rollback()
        # Log full traceback for debugging
        import traceback
        print("❌ SEED ENDPOINT ERROR:")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Seed failed: {str(e)}"
        )

@router.delete("/test/cleanup")
def cleanup_test_data(db: Session = Depends(get_session)):
    """Clean up test data"""
    if not is_test_seed_enabled():
        raise HTTPException(
            status_code=403, 
            detail="Test cleanup endpoint disabled. Set ARTIFACT_ENABLE_TEST_SEED=true"
        )
    
    # Delete in dependency order
    stmt = select(ResearchNode).where(ResearchNode.project_id == TEST_PROJECT_ID)
    facts = db.exec(stmt).all()
    for fact in facts:
        db.delete(fact)
    
    stmt = select(SourceDoc).where(SourceDoc.project_id == TEST_PROJECT_ID)
    sources = db.exec(stmt).all()
    for source in sources:
        db.delete(source)
    
    project = db.get(Project, TEST_PROJECT_ID)
    if project:
        db.delete(project)
    
    db.commit()
    
    return {"status": "ok", "message": "Test data cleaned up"}

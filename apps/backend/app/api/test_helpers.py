"""
Test Helper Endpoints
ONLY enabled when ARTIFACT_ENABLE_TEST_SEED=true
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlmodel import Session, select, delete
from uuid import UUID, uuid4
from pydantic import BaseModel
from typing import Optional, List, Union, Dict, Tuple
import os
import re

from app.db.session import get_session
from app.models import Workspace, Project, SourceDoc, ResearchNode, NodeType, ReviewStatus, Output, Job, JobStatus, SourceType, CanvasState, UserPreference

router = APIRouter()

# Default test fixture IDs (used when not provided)
DEFAULT_WORKSPACE_ID = UUID("123e4567-e89b-12d3-a456-426614174000")  # Personal workspace
DEFAULT_WORKSPACE_ID_TEAM = UUID("123e4567-e89b-12d3-a456-426614174099")  # Team workspace
DEFAULT_PROJECT_ID = UUID("123e4567-e89b-12d3-a456-426614174001")
DEFAULT_SOURCE_ID = UUID("123e4567-e89b-12d3-a456-426614174002")

def is_test_seed_enabled():
    """Check if test seed endpoints are enabled"""
    return os.getenv("ARTIFACT_ENABLE_TEST_SEED", "false").lower() == "true"


def _normalize_whitespace(s: str) -> str:
    """Collapse sequences of whitespace to single space."""
    return re.sub(r"\s+", " ", s.strip())


def _compute_evidence_offsets(content: str, quote: str, fact_label: str) -> Tuple[int, int]:
    """
    Compute evidence_start_char_raw and evidence_end_char_raw deterministically.
    First tries exact find; if not found, retries with whitespace-normalized strings.
    Raises ValueError if quote not found (do NOT leave offsets null).
    Offsets are always for the original content (content_text_raw).
    """
    if not content or not quote:
        raise ValueError(f"[{fact_label}] Empty content or quote")
    idx = content.find(quote)
    if idx == -1:
        norm_content = _normalize_whitespace(content)
        norm_quote = _normalize_whitespace(quote)
        norm_idx = norm_content.find(norm_quote)
        content_preview = content[:120].replace("\n", " ") if content else ""
        quote_preview = quote[:120].replace("\n", " ") if quote else ""
        if norm_idx == -1:
            raise ValueError(
                f"[{fact_label}] quote_text_raw not found in content (exact or normalized). "
                f"Quote ({len(quote)} chars): {repr(quote_preview)}... Content len: {len(content)}, preview: {repr(content_preview)}..."
            )
        # Quote found in normalized but not in raw - offsets would be wrong. Fail fast.
        raise ValueError(
            f"[{fact_label}] quote_text_raw found in normalized content but not in raw. "
            f"Ensure quote exactly matches content_text_raw (whitespace, encoding). "
            f"Quote: {repr(quote_preview)}... Content preview: {repr(content_preview)}..."
        )
    return idx, idx + len(quote)

class SeedRequest(BaseModel):
    """Optional parameters for test seeding (parallel-safe)"""
    project_id: Optional[str] = None  # If provided, use this UUID; else generate new
    source_id: Optional[str] = None   # If provided, use this UUID; else generate new
    facts_count: Optional[int] = 8    # Number of facts to create (default 8 for comprehensive E2E)
    outputs_count: Optional[int] = 0  # Number of deterministic Output rows (E2E, default 0)
    reset: Optional[bool] = True      # If true, delete existing records first (idempotent)
    with_near_duplicate: Optional[bool] = True  # Kitchen sink: include duplicates by default
    with_similar_facts: Optional[bool] = True  # Kitchen sink: include similar facts by default
    with_source_no_content: Optional[bool] = False  # If true, source1 has null content (capture-excerpt-no-content E2E)
    with_pinned_facts: Optional[bool] = True  # Kitchen sink: include pinned facts by default
    with_review_queue: Optional[bool] = False  # If true, fact2/fact4 NEEDS_REVIEW, fact3 FLAGGED (review-queue E2E)
    with_approved_facts: Optional[bool] = True  # Kitchen sink: ensure at least 2 approved facts by default

@router.post("/test/seed")
def seed_test_data(payload: SeedRequest = SeedRequest(), db: Session = Depends(get_session)):
    """
    Seed deterministic test data for E2E tests (parallel-safe).
    
    Accepts optional payload:
    - project_id: Use specific UUID (for worker isolation) or generate new
    - source_id: Use specific UUID or generate new
    - facts_count: Number of facts to create (default 3)
    - outputs_count: Number of deterministic Output rows (default 0)
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
        
        outputs_count = payload.outputs_count or 0
        print(f"🌱 Seeding test data: project={project_id}, source={source_id}, facts={facts_count}, outputs={outputs_count}, reset={payload.reset}")
        
        # Optional: Reset existing data for idempotency
        if payload.reset:
            # Delete in dependency order: user_preferences → facts → outputs → jobs → source_docs → canvas_state → project
            db.exec(delete(UserPreference).where(UserPreference.project_id == project_id))
            db.exec(delete(ResearchNode).where(ResearchNode.project_id == project_id))
            db.exec(delete(Output).where(Output.project_id == project_id))
            db.exec(delete(Job).where(Job.project_id == project_id))
            db.exec(delete(SourceDoc).where(SourceDoc.project_id == project_id))
            db.exec(delete(CanvasState).where(CanvasState.project_id == project_id))
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
        
        # 1. Upsert workspaces (Personal + Team for workspace-switch E2E)
        # Personal workspace (default, contains most test projects)
        workspace = db.get(Workspace, workspace_id)
        if not workspace:
            workspace = Workspace(
                id=workspace_id,
                name="Personal",  # E2E_SEED_WORKSPACES.personal
                settings={}
            )
            db.add(workspace)
        
        # Team workspace (for workspace-switch E2E test)
        team_workspace = db.get(Workspace, DEFAULT_WORKSPACE_ID_TEAM)
        if not team_workspace:
            team_workspace = Workspace(
                id=DEFAULT_WORKSPACE_ID_TEAM,
                name="Team",  # E2E_SEED_WORKSPACES.team
                settings={}
            )
            db.add(team_workspace)
        
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
        use_content = sample_content if not getattr(payload, "with_source_no_content", False) else ""
        source = SourceDoc(
            id=source_id,
            project_id=project_id,
            workspace_id=workspace_id,
            url="https://example.com/climate-research",
            domain="example.com",
            title="Climate Change Research Summary",
            content_text=use_content or None,
            content_text_raw=use_content or None,
            content_markdown=use_content or None
        )
        db.add(source)
        db.flush()
        
        # 3b. Second source (different domain) for E2E "mixed sources" / builder flow
        source2_id = uuid4()
        source2_content = "Additional context for E2E."
        source2 = SourceDoc(
            id=source2_id,
            project_id=project_id,
            workspace_id=workspace_id,
            url="https://other.com/second-source",
            domain="other.com",
            title="Second Source",
            content_text=source2_content,
            content_text_raw=source2_content,
            content_markdown=source2_content,
        )
        db.add(source2)
        db.flush()

        # 3c. Create Job records so header shows "2 Sources" (jobs.length drives source count)
        url1 = "https://example.com/climate-research"
        url2 = "https://other.com/second-source"
        for url, title in [(url1, "Climate Change Research Summary"), (url2, "Second Source")]:
            jid = uuid4()
            job = Job(
                id=jid,
                project_id=project_id,
                workspace_id=workspace_id,
                type="url_ingest",
                status=JobStatus.COMPLETED,
                idempotency_key=f"{project_id}:{url}",
                params={"url": url, "canonical_url": url, "source_type": "WEB"},
                result_summary={"source_title": title, "source_type": "WEB", "facts_count": 0},
            )
            db.add(job)
        db.flush()

        # 4. Create facts (up to facts_count: first 4 named, then bulk for virtualization E2E)
        facts_to_create = min(facts_count, 3)
        
        # Kitchen sink flags
        pin_facts = getattr(payload, "with_pinned_facts", True)  # Default True for comprehensive E2E
        with_approved = getattr(payload, "with_approved_facts", True)  # Default True for comprehensive E2E
        
        # Known fact IDs for stable E2E selectors (data-fact-id)
        known_fact_ids = {
            "approved_1": uuid4(),
            "approved_2": uuid4(),
            "pinned_1": uuid4(),
            "duplicate_original": uuid4(),
            "duplicate_suppressed": uuid4(),
            "similar_rep": uuid4(),
            "no_snippet": uuid4(),
        }
        
        if facts_to_create >= 1:
            quote1 = "global temperatures have risen by approximately 1.1°C since pre-industrial times"
            start1, end1 = _compute_evidence_offsets(sample_content, quote1, "E2E:APPROVED-1")
            snippet1 = "Recent studies indicate that global temperatures have risen by approximately 1.1°C since pre-industrial times. This warming trend is primarily driven by human activities."
            fact1 = ResearchNode(
                id=known_fact_ids["approved_1"],  # Deterministic ID for E2E selectors
                project_id=project_id,
                source_doc_id=source_id,
                type=NodeType.FACT,
                fact_text="[E2E:APPROVED-1] Climate research shows global temperatures have risen by approximately 1.1°C since pre-industrial times",
                quote_text_raw=quote1,
                evidence_snippet=snippet1,
                evidence_start_char_raw=start1,
                evidence_end_char_raw=end1,
                confidence_score=95,
                review_status=ReviewStatus.APPROVED,  # Always APPROVED for with_approved_facts
                is_key_claim=True,
                is_pinned=pin_facts,
            )
            db.add(fact1)

        # Fact 2: Needs review (or pinned); with evidence_snippet
        if facts_to_create >= 2:
            quote2 = "Arctic sea ice has declined by 13% per decade since 1979"
            start2, end2 = _compute_evidence_offsets(sample_content, quote2, "E2E:APPROVED-2/PINNED-1")
            snippet2 = "Key Findings: Arctic sea ice has declined by 13% per decade since 1979. Ocean acidification has increased by 30% since industrial revolution."
            # Make fact2 APPROVED if with_approved_facts (for generate-from-approved test)
            fact2_status = ReviewStatus.APPROVED if with_approved else ReviewStatus.NEEDS_REVIEW
            fact2 = ResearchNode(
                id=known_fact_ids["approved_2"] if with_approved else known_fact_ids["pinned_1"],
                project_id=project_id,
                source_doc_id=source_id,
                type=NodeType.FACT,
                fact_text="[E2E:APPROVED-2] Climate research indicates Arctic sea ice has declined by 13% per decade since 1979" if with_approved else "[E2E:PINNED-1] Climate research indicates Arctic sea ice has declined by 13% per decade since 1979",
                quote_text_raw=quote2,
                evidence_snippet=snippet2,
                evidence_start_char_raw=start2,
                evidence_end_char_raw=end2,
                confidence_score=85 if with_approved else 65,
                review_status=fact2_status,
                is_key_claim=True if with_approved else False,
                is_pinned=pin_facts,
            )
            db.add(fact2)

        # Optional: Review queue mode (2 NEEDS_REVIEW + 1 FLAGGED for E2E)
        review_queue = getattr(payload, "with_review_queue", False)

        # Fact 3: High confidence, approved (or FLAGGED when with_review_queue); with evidence_snippet
        if facts_to_create >= 3:
            quote3 = "Ocean acidification has increased by 30% since industrial revolution"
            start3, end3 = _compute_evidence_offsets(sample_content, quote3, "E2E:APPROVED-3/FLAGGED-1")
            snippet3 = "Key Findings: Arctic sea ice has declined by 13% per decade since 1979. Ocean acidification has increased by 30% since industrial revolution. Extreme weather events are becoming more frequent."
            fact3 = ResearchNode(
                id=uuid4(),  # Not a special anchor, but still deterministic per seed
                project_id=project_id,
                source_doc_id=source_id,
                type=NodeType.FACT,
                fact_text="[E2E:FLAGGED-1] Ocean research confirms acidification has increased by 30% since industrial revolution" if review_queue else "[E2E:APPROVED-3] Ocean research confirms acidification has increased by 30% since industrial revolution",
                quote_text_raw=quote3,
                evidence_snippet=snippet3,
                evidence_start_char_raw=start3,
                evidence_end_char_raw=end3,
                confidence_score=88,
                review_status=ReviewStatus.FLAGGED if review_queue else ReviewStatus.APPROVED,
                is_key_claim=True
            )
            db.add(fact3)

        # 4b. One fact from second source (mixed-source / builder E2E); with evidence_snippet + quote/offsets
        # Offsets computed from source2_content (same var used for SourceDoc) so highlighter matches persisted content
        quote4 = "Additional context for E2E."
        start4, end4 = _compute_evidence_offsets(source2_content, quote4, "E2E:PENDING-1/NEEDS_REVIEW-2")
        fact4 = ResearchNode(
            project_id=project_id,
            source_doc_id=source2_id,
            type=NodeType.FACT,
            fact_text="[E2E:PENDING-1] Additional research context for E2E mixed-source tests." if not review_queue else "[E2E:NEEDS_REVIEW-2] Additional research context for E2E mixed-source tests.",
            quote_text_raw=quote4,
            evidence_snippet="Additional research context for E2E. Second source excerpt for evidence panel.",
            evidence_start_char_raw=start4,
            evidence_end_char_raw=end4,
            confidence_score=80,
            review_status=ReviewStatus.NEEDS_REVIEW if review_queue else ReviewStatus.PENDING,
            is_key_claim=False,
        )
        db.add(fact4)

        # 4b1. Kitchen sink: one NEEDS_REVIEW fact with marker for facts-group-sort E2E
        quote_needs_review = "Paris Agreement aims to limit warming to well below 2°C"
        start_needs_review, end_needs_review = _compute_evidence_offsets(
            sample_content, quote_needs_review, "E2E:NEEDS_REVIEW-1"
        )
        fact_needs_review = ResearchNode(
            project_id=project_id,
            source_doc_id=source_id,
            type=NodeType.FACT,
            fact_text="[E2E:NEEDS_REVIEW-1] Paris Agreement aims to limit warming to well below 2°C",
            quote_text_raw=quote_needs_review,
            evidence_snippet="The Paris Agreement aims to limit warming to well below 2°C, preferably 1.5°C.",
            evidence_start_char_raw=start_needs_review,
            evidence_end_char_raw=end_needs_review,
            confidence_score=70,
            review_status=ReviewStatus.NEEDS_REVIEW,
            is_key_claim=False,
        )
        db.add(fact_needs_review)

        # 4b1b. One fact with no evidence_snippet (for evidence-snippet E2E "when snippet missing")
        fact_no_snippet = ResearchNode(
            project_id=project_id,
            source_doc_id=source_id,
            type=NodeType.FACT,
            fact_text="[E2E:NO_SNIPPET-1] Supplementary climate observation with no excerpt captured.",
            confidence_score=60,
            review_status=ReviewStatus.PENDING,
            is_key_claim=False,
        )
        db.add(fact_no_snippet)

        # 4b2. Optional token-similar facts (for collapse-similar E2E)
        if getattr(payload, "with_similar_facts", False):
            # Pair 1: "X is Y" vs "X is actually Y" (high Jaccard) - APPROVED for cluster-preview E2E
            for text in [
                "[E2E:SIMILAR-1] Arctic research shows sea ice has declined by 13 percent per decade since 1979",
                "[E2E:SIMILAR-2] Arctic research shows sea ice has declined by 13% per decade since 1979",
            ]:
                fn = ResearchNode(
                    project_id=project_id,
                    source_doc_id=source_id,
                    type=NodeType.FACT,
                    fact_text=text,
                    confidence_score=70,
                    review_status=ReviewStatus.APPROVED,
                    is_key_claim=False,
                )
                db.add(fn)
            # Pair 2: Reddit-style paraphrased comments - APPROVED
            for text in [
                "[E2E:SIMILAR-3] Climate research shows change is driven mainly by human activity and emissions",
                "[E2E:SIMILAR-4] Climate research shows change is mainly driven by human activities and greenhouse gas emissions",
            ]:
                fn = ResearchNode(
                    project_id=project_id,
                    source_doc_id=source_id,
                    type=NodeType.FACT,
                    fact_text=text,
                    section_context="reddit:comment:c_sim",
                    source_url="https://reddit.com/r/test/comments/abc123/c_sim/",
                    confidence_score=75,
                    review_status=ReviewStatus.APPROVED,
                    is_key_claim=False,
                )
                db.add(fn)
            # Source B fact: ensures 2 groups when grouped by source (collapse+grouped E2E)
            fn_b = ResearchNode(
                project_id=project_id,
                source_doc_id=source2_id,
                type=NodeType.FACT,
                fact_text="[E2E:APPROVED-5] Additional research context for E2E second-source group.",
                confidence_score=85,
                review_status=ReviewStatus.APPROVED,
                is_key_claim=False,
            )
            db.add(fn_b)
            db.flush()

        # 4c. Optional near-duplicate of fact1 (for dedup E2E)
        if payload.with_near_duplicate and facts_to_create >= 1:
            quote_dup = "global temperatures have risen by approximately 1.1°C since pre-industrial times"
            start_dup, end_dup = _compute_evidence_offsets(sample_content, quote_dup, "E2E:DUPLICATE-1")
            fact1_dup = ResearchNode(
                project_id=project_id,
                source_doc_id=source_id,
                type=NodeType.FACT,
                fact_text="[E2E:DUPLICATE-1] Climate research shows global temperatures have risen by approximately 1.1 degrees Celsius since pre-industrial times.",
                quote_text_raw=quote_dup,
                evidence_snippet="Recent studies indicate that global temperatures have risen by approximately 1.1°C since pre-industrial times.",
                evidence_start_char_raw=start_dup,
                evidence_end_char_raw=end_dup,
                confidence_score=90,
                review_status=ReviewStatus.PENDING,
                is_key_claim=False,
            )
            db.add(fact1_dup)

        # 4d. Bulk facts for virtualization E2E (when facts_count > 4)
        extra_count = max(0, facts_count - 4)
        for i in range(extra_count):
            fn = ResearchNode(
                project_id=project_id,
                source_doc_id=source_id,
                type=NodeType.FACT,
                fact_text=f"Bulk fact #{i + 5} for virtualization E2E. Climate research supplementary point.",
                confidence_score=50 + (i % 45),
                review_status=ReviewStatus.APPROVED if i % 3 == 0 else ReviewStatus.PENDING,
                is_key_claim=(i % 5 == 0),
            )
            db.add(fn)
        if extra_count:
            db.flush()

        # 5. Create deterministic outputs (E2E) when outputs_count > 0
        outputs_created = 0
        if payload.outputs_count and payload.outputs_count > 0:
            for k in range(1, payload.outputs_count + 1):
                content = f"E2E Output #{k}\n\nSources: 1 | Mode: paragraph"
                out = Output(
                    project_id=project_id,
                    title=f"E2E Output #{k}",
                    content=content,
                    output_type="synthesis",
                    mode="paragraph",
                    fact_ids=[],
                    source_count=1,
                )
                db.add(out)
                outputs_created += 1
            db.flush()
        
        # Commit transaction
        db.commit()
        
        # Query back the actual facts to verify seed worked
        facts = db.exec(select(ResearchNode).where(ResearchNode.project_id == project_id)).all()
        
        similar_count = 5 if getattr(payload, "with_similar_facts", False) else 0  # 4 similar + 1 source B
        actual_facts_count = len(facts)
        approved_count = sum(1 for f in facts if f.review_status == ReviewStatus.APPROVED)
        pinned_count = sum(1 for f in facts if f.is_pinned)
        flagged_count = sum(1 for f in facts if f.review_status == ReviewStatus.FLAGGED)
        
        # Count facts with evidence
        evidence_count = sum(1 for f in facts if f.evidence_snippet)
        
        result = {
            "status": "ok",
            "message": "Test data seeded successfully",
            "workspace_id": str(workspace_id),
            "project_id": str(project_id),
            "source_id": str(source_id),
            "facts_count": actual_facts_count,
            "approved_count": approved_count,
            "pinned_count": pinned_count,
            "flagged_count": flagged_count,
            "evidence_count": evidence_count,
            "seed_verification": {
                "expected_facts": facts_to_create + 1 + extra_count + similar_count,
                "actual_facts": actual_facts_count,
                "has_approved": approved_count >= 2,
                "has_pinned": pinned_count >= 2 if pin_facts else True,
                "has_evidence": evidence_count > 0,
            },
            "known_fact_ids": {k: str(v) for k, v in known_fact_ids.items()},  # Return known IDs for E2E selectors
        }
        if outputs_created > 0:
            result["outputs_count"] = outputs_created
        return result
    
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

class SeedSourcesRequest(BaseModel):
    """Payload for multi-source demo seeding (E2E deterministic)."""
    project_id: str
    reset: Optional[bool] = True
    sources: List[Union[str, Dict[str, str]]]  # ["reddit", "youtube"] or [{"kind": "reddit", "mode": "ok"}, ...]


def _normalize_sources(sources: List[Union[str, Dict[str, str]]]) -> List[tuple]:
    out = []
    for s in sources:
        if isinstance(s, str):
            out.append((s.lower(), "ok"))
        elif isinstance(s, dict):
            kind = (s.get("kind") or "web").lower()
            mode = (s.get("mode") or "ok").lower()
            out.append((kind, mode))
        else:
            out.append(("web", "ok"))
    return out


@router.post("/test/seed_sources")
def seed_sources(payload: SeedSourcesRequest, db: Session = Depends(get_session)):
    """
    Seed sources with optional failure modes (no external network).
    sources: ["reddit", "youtube"] or [{"kind": "reddit", "mode": "ok"}, {"kind": "youtube", "mode": "transcript_disabled"}, ...]
    Modes: ok, transcript_disabled, paywall, empty_content. FAILED jobs get error_code + error_message.
    """
    if not is_test_seed_enabled():
        raise HTTPException(status_code=403, detail="Test seed disabled. Set ARTIFACT_ENABLE_TEST_SEED=true")
    try:
        project_id = UUID(payload.project_id)
        workspace_id = DEFAULT_WORKSPACE_ID
        job_ids = []
        source_ids = []
        normalized = _normalize_sources(payload.sources)

        if payload.reset:
            db.exec(delete(ResearchNode).where(ResearchNode.project_id == project_id))
            db.exec(delete(Job).where(Job.project_id == project_id))
            db.exec(delete(SourceDoc).where(SourceDoc.project_id == project_id))
            db.flush()

        project = db.get(Project, project_id)
        if not project:
            project = Project(
                id=project_id,
                workspace_id=workspace_id,
                title=f"Test Project ({str(project_id)[:8]})",
                storage_path_root=f"test/e2e/{str(project_id)[:8]}",
            )
            db.add(project)
            db.flush()

        for kind, mode in normalized:
            if kind == "reddit" and mode == "ok":
                thread_url = "https://www.reddit.com/r/test/comments/abc123/demo_thread/"
                sid = uuid4()
                src = SourceDoc(
                    id=sid,
                    project_id=project_id,
                    workspace_id=workspace_id,
                    url=thread_url,
                    domain="reddit.com",
                    title="E2E Reddit Demo Thread",
                    source_type=SourceType.REDDIT,
                    canonical_url=thread_url,
                    metadata_json={
                        "thread_url": thread_url,
                        "comments": [
                            {"id": "c1", "permalink": thread_url + "c1/", "author": "u1", "score": 10},
                            {"id": "c2", "permalink": thread_url + "c2/", "author": "u2", "score": 8},
                            {"id": "c3", "permalink": thread_url + "c3/", "author": "u3", "score": 6},
                            {"id": "c4", "permalink": thread_url + "c4/", "author": "u4", "score": 4},
                        ],
                    },
                    content_text_raw="OP: This is the demo thread. Comment 1: First comment. Comment 2: Second. Comment 3: Third. Comment 4: Fourth.",
                    content_text=thread_url,
                )
                db.add(src)
                db.flush()
                source_ids.append(str(sid))

                op_quote = "This is the demo thread"
                for i in range(2):
                    fn = ResearchNode(
                        project_id=project_id,
                        source_doc_id=sid,
                        type=NodeType.FACT,
                        fact_text=f"Reddit OP fact {i+1} for E2E.",
                        section_context="reddit:op",
                        source_url=thread_url,
                        quote_text_raw=op_quote,
                        evidence_snippet=op_quote,
                        confidence_score=85,
                        review_status=ReviewStatus.PENDING,
                    )
                    db.add(fn)
                for cid, permalink in [("c1", thread_url + "c1/"), ("c2", thread_url + "c2/"), ("c3", thread_url + "c3/"), ("c4", thread_url + "c4/")]:
                    fn = ResearchNode(
                        project_id=project_id,
                        source_doc_id=sid,
                        type=NodeType.FACT,
                        fact_text=f"Reddit comment fact from {cid}.",
                        section_context=f"reddit:comment:{cid}",
                        source_url=permalink,
                        evidence_snippet=f"Comment {cid} excerpt.",
                        confidence_score=80,
                        review_status=ReviewStatus.PENDING,
                    )
                    db.add(fn)
                db.flush()

                jid = uuid4()
                job = Job(
                    id=jid,
                    project_id=project_id,
                    workspace_id=workspace_id,
                    type="url_ingest",
                    status=JobStatus.COMPLETED,
                    idempotency_key=f"{project_id}:{thread_url}",
                    params={"url": thread_url, "canonical_url": thread_url, "source_type": "REDDIT"},
                    result_summary={"source_title": "E2E Reddit Demo Thread", "source_type": "REDDIT", "facts_count": 6},
                )
                db.add(job)
                job_ids.append(str(jid))

            elif kind == "reddit" and mode != "ok":
                thread_url = "https://www.reddit.com/r/test/comments/abc123/demo_thread/"
                err_code = "PAYWALL" if mode == "paywall" else "EMPTY_CONTENT" if mode == "empty_content" else "UNSUPPORTED"
                err_msg = "Demo paywall" if mode == "paywall" else "No content extracted" if mode == "empty_content" else "Demo failure"
                jid = uuid4()
                job = Job(
                    id=jid,
                    project_id=project_id,
                    workspace_id=workspace_id,
                    type="url_ingest",
                    status=JobStatus.FAILED,
                    idempotency_key=f"{project_id}:{thread_url}:fail",
                    current_step="FAILED",
                    params={"url": thread_url, "canonical_url": thread_url, "source_type": "REDDIT"},
                    result_summary={"error_code": err_code, "error_message": err_msg, "source_title": "E2E Reddit (failed)"},
                )
                db.add(job)
                job_ids.append(str(jid))

            elif kind == "youtube" and mode == "ok":
                video_url = "https://www.youtube.com/watch?v=e2e_demo_yt"
                sid = uuid4()
                src = SourceDoc(
                    id=sid,
                    project_id=project_id,
                    workspace_id=workspace_id,
                    url=video_url,
                    domain="youtube.com",
                    title="E2E YouTube Demo Video",
                    source_type=SourceType.YOUTUBE,
                    canonical_url=video_url,
                    metadata_json={
                        "video_url": video_url,
                        "transcript": [{"start_s": 0, "end_s": 10}, {"start_s": 10, "end_s": 20}, {"start_s": 20, "end_s": 30}],
                    },
                    content_text_raw="Transcript segment one. Segment two. Segment three.",
                    content_text=video_url,
                )
                db.add(src)
                db.flush()
                source_ids.append(str(sid))

                for i, (start, end) in enumerate([(0, 10), (10, 20), (20, 30), (0, 10), (10, 20), (20, 30)]):
                    fn = ResearchNode(
                        project_id=project_id,
                        source_doc_id=sid,
                        type=NodeType.FACT,
                        fact_text=f"YouTube transcript fact {i+1} for E2E.",
                        section_context=f"yt:{start}-{end}",
                        source_url=video_url,
                        evidence_snippet=f"Transcript {start}-{end}s excerpt.",
                        confidence_score=82,
                        review_status=ReviewStatus.PENDING,
                    )
                    db.add(fn)
                db.flush()

                jid = uuid4()
                job = Job(
                    id=jid,
                    project_id=project_id,
                    workspace_id=workspace_id,
                    type="url_ingest",
                    status=JobStatus.COMPLETED,
                    idempotency_key=f"{project_id}:{video_url}",
                    params={"url": video_url, "canonical_url": video_url, "source_type": "YOUTUBE"},
                    result_summary={"source_title": "E2E YouTube Demo Video", "source_type": "YOUTUBE", "facts_count": 6},
                )
                db.add(job)
                job_ids.append(str(jid))

            elif kind == "youtube" and mode != "ok":
                video_url = "https://www.youtube.com/watch?v=e2e_demo_yt"
                err_code = "TRANSCRIPT_DISABLED" if mode == "transcript_disabled" else "PAYWALL" if mode == "paywall" else "EMPTY_CONTENT"
                err_msg = "Captions not available — upload audio file" if mode == "transcript_disabled" else "Demo paywall" if mode == "paywall" else "No content extracted"
                jid = uuid4()
                job = Job(
                    id=jid,
                    project_id=project_id,
                    workspace_id=workspace_id,
                    type="url_ingest",
                    status=JobStatus.FAILED,
                    idempotency_key=f"{project_id}:{video_url}:fail",
                    current_step="FAILED",
                    params={"url": video_url, "canonical_url": video_url, "source_type": "YOUTUBE"},
                    result_summary={"error_code": err_code, "error_message": err_msg, "source_title": "E2E YouTube (failed)"},
                )
                db.add(job)
                job_ids.append(str(jid))

            elif kind == "web" and mode == "ok":
                web_url = "https://example.com/e2e-web-demo"
                sid = uuid4()
                src = SourceDoc(
                    id=sid,
                    project_id=project_id,
                    workspace_id=workspace_id,
                    url=web_url,
                    domain="example.com",
                    title="E2E Web Demo",
                    source_type=SourceType.WEB,
                    canonical_url=web_url,
                    content_text_raw="Web demo content.",
                    content_text=web_url,
                )
                db.add(src)
                db.flush()
                source_ids.append(str(sid))
                fn = ResearchNode(
                    project_id=project_id,
                    source_doc_id=sid,
                    type=NodeType.FACT,
                    fact_text="Web demo fact for E2E.",
                    confidence_score=80,
                    review_status=ReviewStatus.PENDING,
                )
                db.add(fn)
                db.flush()
                jid = uuid4()
                job = Job(
                    id=jid,
                    project_id=project_id,
                    workspace_id=workspace_id,
                    type="url_ingest",
                    status=JobStatus.COMPLETED,
                    idempotency_key=f"{project_id}:{web_url}",
                    params={"url": web_url, "canonical_url": web_url, "source_type": "WEB"},
                    result_summary={"source_title": "E2E Web Demo", "source_type": "WEB", "facts_count": 1},
                )
                db.add(job)
                job_ids.append(str(jid))

            elif kind == "web" and mode != "ok":
                web_url = "https://example.com/e2e-web-fail"
                err_code = "PAYWALL" if mode == "paywall" else "EMPTY_CONTENT" if mode == "empty_content" else "UNSUPPORTED"
                err_msg = "Demo paywall" if mode == "paywall" else "No content could be extracted from this page." if mode == "empty_content" else "Demo failure"
                jid = uuid4()
                job = Job(
                    id=jid,
                    project_id=project_id,
                    workspace_id=workspace_id,
                    type="url_ingest",
                    status=JobStatus.FAILED,
                    idempotency_key=f"{project_id}:{web_url}:fail",
                    current_step="FAILED",
                    params={"url": web_url, "canonical_url": web_url, "source_type": "WEB"},
                    result_summary={"error_code": err_code, "error_message": err_msg, "source_title": "E2E Web (failed)"},
                )
                db.add(job)
                job_ids.append(str(jid))
                # Sentinel fact so "page ready" checks (fact-card) pass; retry flow still tests stub completion
                sid = uuid4()
                src = SourceDoc(
                    id=sid,
                    project_id=project_id,
                    workspace_id=workspace_id,
                    url=web_url,
                    domain="example.com",
                    title="E2E Web (failed, sentinel)",
                    source_type=SourceType.WEB,
                    canonical_url=web_url,
                    content_text_raw="Sentinel content for E2E source-retry.",
                    content_text=web_url,
                )
                db.add(src)
                db.flush()
                fn = ResearchNode(
                    project_id=project_id,
                    source_doc_id=sid,
                    type=NodeType.FACT,
                    fact_text="Sentinel fact for E2E source-retry (failed job).",
                    confidence_score=70,
                    review_status=ReviewStatus.PENDING,
                )
                db.add(fn)

        db.commit()
        return {"status": "ok", "job_ids": job_ids, "source_ids": source_ids}
    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"seed_sources failed: {str(e)}")


@router.delete("/test/cleanup")
def cleanup_test_data(db: Session = Depends(get_session)):
    """Clean up test data"""
    if not is_test_seed_enabled():
        raise HTTPException(
            status_code=403, 
            detail="Test cleanup endpoint disabled. Set ARTIFACT_ENABLE_TEST_SEED=true"
        )
    
    # Delete in dependency order
    stmt = select(ResearchNode).where(ResearchNode.project_id == DEFAULT_PROJECT_ID)
    facts = db.exec(stmt).all()
    for fact in facts:
        db.delete(fact)
    
    stmt = select(SourceDoc).where(SourceDoc.project_id == DEFAULT_PROJECT_ID)
    sources = db.exec(stmt).all()
    for source in sources:
        db.delete(source)
    
    project = db.get(Project, DEFAULT_PROJECT_ID)
    if project:
        db.delete(project)
    
    db.commit()
    
    return {"status": "ok", "message": "Test data cleaned up"}


@router.post("/test/clear_projects")
def clear_all_projects(db: Session = Depends(get_session)):
    """
    Delete ALL projects and their data (facts, outputs, jobs, sources, canvas, preferences).
    Use for a fresh start before E2E. Only enabled when ARTIFACT_ENABLE_TEST_SEED=true.
    """
    if not is_test_seed_enabled():
        raise HTTPException(
            status_code=403,
            detail="Test endpoint disabled. Set ARTIFACT_ENABLE_TEST_SEED=true",
        )
    projects = db.exec(select(Project)).all()
    project_ids = [p.id for p in projects]
    if not project_ids:
        return {"status": "ok", "message": "No projects to clear", "deleted": 0}
    for pid in project_ids:
        db.exec(delete(ResearchNode).where(ResearchNode.project_id == pid))
        db.exec(delete(Output).where(Output.project_id == pid))
        db.exec(delete(Job).where(Job.project_id == pid))
        db.exec(delete(SourceDoc).where(SourceDoc.project_id == pid))
        db.exec(delete(CanvasState).where(CanvasState.project_id == pid))
        db.exec(delete(UserPreference).where(UserPreference.project_id == pid))
    for pid in project_ids:
        db.exec(delete(Project).where(Project.id == pid))
    db.commit()
    return {"status": "ok", "message": "All projects cleared", "deleted": len(project_ids)}

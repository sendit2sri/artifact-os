import os
import re
import uuid
from difflib import SequenceMatcher
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from sqlmodel import Session, select, desc, delete
from typing import List, Optional, Dict, Any, Tuple
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime, timezone

from app.db.session import get_session
from app.models import (
    Project,
    Job,
    ResearchNode,
    SourceDoc,
    Output,
    ReviewStatus,
    JobStatus,
    IngestRule,
    ProjectBucketSet,
    ProjectBucketItem,
    ProjectBucketFact,
)

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
    review_status: Optional[str] = None  # For quality_stats computation
    is_pinned: Optional[bool] = None

class SynthesisRequest(BaseModel):
    facts: List[FactInput]
    mode: str = "paragraph"

class AnalysisResponse(BaseModel):
    clusters: List[Dict]


# --- Buckets (TicNote V2b) ---

class BucketItemSchema(BaseModel):
    id: UUID
    name: str
    factIds: List[UUID]
    position: int = 0


class BucketsResponse(BaseModel):
    buckets: List[BucketItemSchema]


class BucketsPutRequest(BaseModel):
    buckets: List[BucketItemSchema]


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


@router.get("/projects/{project_id}/buckets", response_model=BucketsResponse)
def get_project_buckets(project_id: str, db: Session = Depends(get_session)):
    """Get persisted buckets for a project. Returns empty list if none."""
    try:
        p_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project_id")
    project = db.get(Project, p_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    bucket_set = db.exec(
        select(ProjectBucketSet).where(ProjectBucketSet.project_id == p_uuid)
    ).first()
    if not bucket_set:
        return BucketsResponse(buckets=[])
    items = db.exec(
        select(ProjectBucketItem).where(ProjectBucketItem.bucket_set_id == bucket_set.id).order_by(ProjectBucketItem.position, ProjectBucketItem.id)
    ).all()
    out = []
    for item in items:
        facts = db.exec(
            select(ProjectBucketFact).where(ProjectBucketFact.bucket_item_id == item.id).order_by(ProjectBucketFact.position, ProjectBucketFact.id)
        ).all()
        fact_ids = [f.fact_id for f in facts]
        out.append(BucketItemSchema(id=item.bucket_id, name=item.name, factIds=fact_ids, position=item.position))
    return BucketsResponse(buckets=out)


@router.put("/projects/{project_id}/buckets", response_model=BucketsResponse)
def put_project_buckets(project_id: str, body: BucketsPutRequest, db: Session = Depends(get_session)):
    """Replace all persisted buckets for the project. Empty list clears all. Transactional."""
    try:
        p_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project_id")
    project = db.get(Project, p_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    # Validate: non-empty name, valid UUIDs
    for b in body.buckets:
        if not (b.name and b.name.strip()):
            raise HTTPException(status_code=400, detail="Bucket name required")
    try:
        bucket_set = db.exec(
            select(ProjectBucketSet).where(ProjectBucketSet.project_id == p_uuid)
        ).first()
        if not bucket_set:
            bucket_set = ProjectBucketSet(project_id=p_uuid)
            db.add(bucket_set)
            db.flush()
        set_id = bucket_set.id
        # Delete all items (CASCADE deletes facts)
        db.exec(delete(ProjectBucketItem).where(ProjectBucketItem.bucket_set_id == set_id))
        # Insert new items and facts
        for idx, b in enumerate(body.buckets):
            item = ProjectBucketItem(
                bucket_set_id=set_id,
                bucket_id=b.id,
                name=b.name.strip(),
                position=b.position if b.position is not None else idx,
            )
            db.add(item)
            db.flush()
            for fidx, fid in enumerate(b.factIds):
                db.add(ProjectBucketFact(bucket_item_id=item.id, fact_id=fid, position=fidx))
        bucket_set.updated_at = datetime.now(timezone.utc)
        db.add(bucket_set)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return get_project_buckets(project_id, db)


@router.get("/projects/{project_id}/export")
def export_project(
    project_id: str,
    format: str = "markdown",
    db: Session = Depends(get_session),
):
    """Export project facts as markdown, json, or csv. Deterministic with seeded data."""
    p_uuid = UUID(project_id)
    statement = (
        select(ResearchNode)
        .where(ResearchNode.project_id == p_uuid)
        .order_by(ResearchNode.created_at.asc())
    )
    nodes = db.exec(statement).all()

    facts = []
    for node in nodes:
        if node.is_suppressed:
            continue
        source = db.get(SourceDoc, node.source_doc_id)
        ev = getattr(node, "evidence_snippet", None) or ""
        fact_url = getattr(node, "source_url", None) or (source.url if source else "")
        facts.append({
            "source_domain": source.domain if source else "Unknown",
            "source_url": fact_url,
            "fact_text": node.fact_text,
            "confidence_score": node.confidence_score,
            "is_key_claim": node.is_key_claim,
            "review_status": str(node.review_status.value) if hasattr(node.review_status, "value") else str(node.review_status),
            "is_pinned": node.is_pinned,
            "evidence_snippet": ev,
        })

    if format == "markdown":
        lines = []
        for f in facts:
            lines.append(f"### {f['source_domain']}\n> {f['fact_text']}\n*Confidence: {f['confidence_score']}/100 | Key Claim: {'Yes' if f['is_key_claim'] else 'No'}*")
        content = "\n".join(lines)
        return Response(content=content, media_type="text/markdown; charset=utf-8")
    elif format == "markdown_evidence":
        lines = []
        for f in facts:
            snippet = (f.get("evidence_snippet") or "").strip() or "No excerpt captured yet"
            lines.append(f"### {f['source_domain']}\n**Fact**\n> {f['fact_text']}\n\n**Evidence**\n{snippet}\n\n**Source** {f['source_url']}\n*Confidence: {f['confidence_score']}/100 | Key Claim: {'Yes' if f['is_key_claim'] else 'No'}*")
        content = "\n".join(lines)
        return Response(content=content, media_type="text/markdown; charset=utf-8")
    elif format == "csv":
        import csv
        import io
        out = io.StringIO()
        writer = csv.writer(out)
        writer.writerow(["Source", "Fact", "Confidence", "Key Claim"])
        for f in facts:
            writer.writerow([
                f["source_domain"],
                f["fact_text"],
                f["confidence_score"],
                "Yes" if f["is_key_claim"] else "No",
            ])
        return Response(content=out.getvalue(), media_type="text/csv; charset=utf-8")
    elif format == "csv_evidence":
        import csv
        import io
        out = io.StringIO()
        writer = csv.writer(out)
        writer.writerow(["source_domain", "source_url", "fact_text", "confidence_score", "is_key_claim", "review_status", "is_pinned", "evidence_snippet"])
        for f in facts:
            writer.writerow([
                f["source_domain"],
                f["source_url"],
                f["fact_text"],
                f["confidence_score"],
                "Yes" if f["is_key_claim"] else "No",
                f.get("review_status", ""),
                "Yes" if f.get("is_pinned") else "No",
                ((f.get("evidence_snippet") or "").strip() or "No excerpt captured yet").replace("\n", " ").replace('"', '""'),
            ])
        return Response(content=out.getvalue(), media_type="text/csv; charset=utf-8")
    elif format == "json":
        return JSONResponse(content=facts)
    else:
        raise HTTPException(status_code=400, detail=f"Invalid format: {format}")

# --- Ingest Rules (V4a) ---

class IngestRuleCreate(BaseModel):
    type: str  # folder_watch | rss_ingest | scheduled_url
    config_json: Dict[str, Any] = {}

class IngestRuleRead(BaseModel):
    id: str
    project_id: str
    type: str
    config_json: Dict[str, Any]
    enabled: bool
    created_at: Any

@router.get("/projects/{project_id}/ingest-rules")
def list_ingest_rules(project_id: str, db: Session = Depends(get_session)):
    """List auto-ingest rules for a project (V4a)."""
    try:
        p_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID")
    project = db.get(Project, p_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    rules = db.exec(select(IngestRule).where(IngestRule.project_id == p_uuid).order_by(IngestRule.created_at)).all()
    return [
        {"id": str(r.id), "project_id": str(r.project_id), "type": r.type, "config_json": r.config_json or {}, "enabled": r.enabled, "created_at": r.created_at}
        for r in rules
    ]

@router.post("/projects/{project_id}/ingest-rules")
def create_ingest_rule(project_id: str, body: IngestRuleCreate, db: Session = Depends(get_session)):
    """Create an auto-ingest rule (V4a). Types: folder_watch, rss_ingest, scheduled_url."""
    try:
        p_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID")
    if body.type not in ("folder_watch", "rss_ingest", "scheduled_url"):
        raise HTTPException(status_code=400, detail="type must be folder_watch, rss_ingest, or scheduled_url")
    project = db.get(Project, p_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    rule = IngestRule(
        project_id=p_uuid,
        type=body.type,
        config_json=body.config_json or {},
        enabled=True,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return {"id": str(rule.id), "project_id": str(rule.project_id), "type": rule.type, "config_json": rule.config_json or {}, "enabled": rule.enabled, "created_at": rule.created_at}

@router.delete("/projects/{project_id}/ingest-rules/{rule_id}")
def delete_ingest_rule(project_id: str, rule_id: str, db: Session = Depends(get_session)):
    """Delete an ingest rule (V4a)."""
    try:
        p_uuid = UUID(project_id)
        r_uuid = UUID(rule_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID")
    rule = db.get(IngestRule, r_uuid)
    if not rule or rule.project_id != p_uuid:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()
    return {"status": "ok"}


@router.post("/projects/{project_id}/reset")
def reset_project(project_id: str, db: Session = Depends(get_session)):
    try:
        p_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID")

    # Delete in order of dependencies
    db.exec(delete(IngestRule).where(IngestRule.project_id == p_uuid))
    db.exec(delete(ResearchNode).where(ResearchNode.project_id == p_uuid))
    db.exec(delete(Job).where(Job.project_id == p_uuid))
    db.exec(delete(SourceDoc).where(SourceDoc.project_id == p_uuid))
    
    db.commit()
    return {"status": "ok", "message": "Project reset successfully"}

class DedupRequest(BaseModel):
    threshold: float = 0.92
    limit: int = 500


def _normalize_text(s: str) -> str:
    s = (s or "").lower().strip()
    s = re.sub(r"\s+", " ", s)
    return s


# Lexical grouping: deterministic, no embeddings
_GROUP_STOPWORDS = frozenset({"and", "the", "a", "an", "to", "of", "in", "on", "for", "with", "is", "it", "that", "this", "as", "at", "by", "from"})


def _normalize_for_grouping(s: str) -> str:
    s = (s or "").lower().strip()
    s = re.sub(r"[^\w\s]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s


def _tokenize(s: str) -> set:
    tokens = (s or "").split()
    return {t for t in tokens if t and t not in _GROUP_STOPWORDS and len(t) > 1}


def _jaccard_similarity(a: str, b: str) -> float:
    ta, tb = _tokenize(_normalize_for_grouping(a)), _tokenize(_normalize_for_grouping(b))
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    union = len(ta | tb)
    return inter / union if union else 0.0


def _cluster_facts_lexical(nodes: List[Any], min_sim: float, limit: int) -> tuple:
    """Greedy clustering: newest→oldest, assign to first matching cluster. Returns (cluster_map, group_id_by_rep)."""
    nodes = list(nodes)[:limit]
    clusters: List[List[Any]] = []
    for node in nodes:
        placed = False
        for cluster in clusters:
            rep = cluster[0]
            if _jaccard_similarity(node.fact_text, rep.fact_text) >= min_sim:
                cluster.append(node)
                placed = True
                break
        if not placed:
            clusters.append([node])
    group_ids: Dict[str, str] = {}
    for cluster in clusters:
        rep = min(cluster, key=_canonical_sort_key)
        canonical_text = _normalize_for_grouping(rep.fact_text)
        gid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"fact-group:{canonical_text[:200]}"))
        group_ids[str(rep.id)] = gid
    return clusters, group_ids


def _similarity(a: str, b: str) -> float:
    na, nb = _normalize_text(a), _normalize_text(b)
    if not na or not nb:
        return 0.0
    return SequenceMatcher(None, na, nb).ratio()


def _canonical_sort_key(node: ResearchNode) -> tuple:
    """Canonical: prefer is_pinned, then is_key_claim, then higher confidence, then older created_at."""
    return (
        0 if node.is_pinned else 1,
        0 if node.is_key_claim else 1,
        -node.confidence_score,
        node.created_at or datetime.min,
    )


@router.post("/projects/{project_id}/facts/dedup")
def dedup_facts(project_id: str, body: DedupRequest, db: Session = Depends(get_session)):
    """Find near-duplicate facts and suppress non-canonical ones. Deterministic, no ML."""
    p_uuid = UUID(project_id)
    statement = (
        select(ResearchNode)
        .where(
            ResearchNode.project_id == p_uuid,
            ResearchNode.is_suppressed.is_not(True),
        )
        .order_by(ResearchNode.created_at.asc())
    )
    nodes = list(db.exec(statement).all())[: body.limit]
    if len(nodes) < 2:
        return {"groups": [], "suppressed_count": 0}

    groups: List[Dict] = []
    suppressed_ids: set = set()
    seen_in_group: set = set()

    for i, a in enumerate(nodes):
        if a.id in seen_in_group:
            continue
        candidates = [a]
        for b in nodes[i + 1 :]:
            if b.id in seen_in_group or b.id in suppressed_ids:
                continue
            if _similarity(a.fact_text, b.fact_text) >= body.threshold:
                candidates.append(b)
                seen_in_group.add(b.id)

        if len(candidates) < 2:
            continue

        canonical = min(candidates, key=_canonical_sort_key)
        group_id = uuid.uuid4()
        for c in candidates:
            if c.id != canonical.id:
                c.is_suppressed = True
                c.canonical_fact_id = canonical.id
                c.duplicate_group_id = group_id
                suppressed_ids.add(c.id)
                db.add(c)

        groups.append({
            "group_id": str(group_id),
            "canonical_fact_id": str(canonical.id),
            "fact_ids": [str(n.id) for n in candidates],
            "reason": "near_duplicate",
            "score": body.threshold,
        })

    db.commit()
    return {"groups": groups, "suppressed_count": len(suppressed_ids)}


@router.get("/projects/{project_id}/facts")
def get_project_facts(
    project_id: str,
    review_status: Optional[str] = None,
    filter: Optional[str] = None,  # all | needs_review | key_claims | approved | flagged | rejected
    sort: Optional[str] = None,    # newest | confidence | key_claims
    order: Optional[str] = "desc", # asc | desc
    show_suppressed: Optional[bool] = False,
    group_similar: Optional[int] = 0,  # 0=off, 1=on (collapse near-duplicates)
    similarity_mode: Optional[str] = "lexical",
    min_sim: Optional[float] = 0.88,
    group_limit: Optional[int] = 500,
    db: Session = Depends(get_session),
):
    """
    Get project facts with filtering and sorting (STEP #8).
    When group_similar=1, returns { items, groups } with representative facts and collapsed groups.
    """
    statement = select(ResearchNode).where(ResearchNode.project_id == UUID(project_id))
    if not show_suppressed:
        statement = statement.where(ResearchNode.is_suppressed.is_not(True))

    # ✅ STEP #8: Apply filters
    # Support legacy review_status param for backward compatibility
    active_filter = filter or review_status
    
    if active_filter:
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
        elif active_filter == "pinned":
            # Show only pinned facts
            statement = statement.where(ResearchNode.is_pinned)
        elif active_filter == "key_claims":
            # Show only key claims
            statement = statement.where(ResearchNode.is_key_claim)
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
    elif sort == "needs_review":
        # Needs review first: NEEDS_REVIEW -> FLAGGED -> APPROVED/PENDING/REJECTED, then created_at desc
        from sqlalchemy import case
        status_order = case(
            (ResearchNode.review_status == ReviewStatus.NEEDS_REVIEW, 0),
            (ResearchNode.review_status == ReviewStatus.FLAGGED, 1),
            (ResearchNode.review_status == ReviewStatus.PENDING, 2),
            (ResearchNode.review_status == ReviewStatus.APPROVED, 3),
            (ResearchNode.review_status == ReviewStatus.REJECTED, 4),
            else_=5
        )
        statement = statement.order_by(status_order.asc(), ResearchNode.created_at.desc())
    else:
        # Default: newest first
        if order == "asc":
            statement = statement.order_by(ResearchNode.created_at.asc())
        else:
            statement = statement.order_by(ResearchNode.created_at.desc())
    
    results = list(db.exec(statement).all())

    # Join with source docs to get domain/url (fact.source_url overrides for Reddit permalink, etc.)
    facts_with_source = []
    for fact in results:
        source = db.get(SourceDoc, fact.source_doc_id)
        fact_url = getattr(fact, "source_url", None) or (source.url if source else "")
        facts_with_source.append({
            **fact.model_dump(),
            "source_domain": source.domain if source else "Unknown",
            "source_url": fact_url,
        })

    if group_similar != 1:
        return facts_with_source

    # Group similar facts (compute on read, no schema change)
    sim = max(0.0, min(1.0, min_sim or 0.88))
    limit = max(1, min(500, group_limit or 500))
    node_list = results[:limit]
    clusters, _ = _cluster_facts_lexical(node_list, sim, limit)

    # Build id -> fact dict
    id_to_fact = {f["id"]: f for f in facts_with_source}

    items = []
    groups: Dict[str, Dict] = {}
    for cluster in clusters:
        rep = min(cluster, key=_canonical_sort_key)
        canonical_text = _normalize_for_grouping(rep.fact_text)
        gid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"fact-group:{canonical_text[:200]}"))
        collapsed_ids = [str(n.id) for n in cluster]
        collapsed_count = len(cluster)
        groups[gid] = {"collapsed_ids": collapsed_ids, "collapsed_count": collapsed_count}
        rep_fact = id_to_fact.get(str(rep.id), {})
        rep_fact = {**rep_fact, "group_id": gid, "collapsed_count": collapsed_count}
        items.append(rep_fact)

    return {"items": items, "groups": groups}


@router.get("/projects/{project_id}/facts/group/{group_id}")
def get_facts_group(
    project_id: str,
    group_id: str,
    db: Session = Depends(get_session),
):
    """Return full list of facts for a group. Requires group_similar=1 fetch first to know group_id."""
    p_uuid = UUID(project_id)
    statement = (
        select(ResearchNode)
        .where(
            ResearchNode.project_id == p_uuid,
            ResearchNode.is_suppressed.is_not(True),
        )
        .order_by(ResearchNode.created_at.desc())
    )
    results = list(db.exec(statement).all())
    sim = 0.88
    limit = 500
    clusters, _ = _cluster_facts_lexical(results, sim, limit)
    for cluster in clusters:
        rep = min(cluster, key=_canonical_sort_key)
        canonical_text = _normalize_for_grouping(rep.fact_text)
        gid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"fact-group:{canonical_text[:200]}"))
        if gid == group_id:
            facts_out = []
            for node in cluster:
                source = db.get(SourceDoc, node.source_doc_id)
                fact_url = getattr(node, "source_url", None) or (source.url if source else "")
                facts_out.append({
                    **node.model_dump(),
                    "source_domain": source.domain if source else "Unknown",
                    "source_url": fact_url,
                })
            return facts_out
    raise HTTPException(status_code=404, detail="Group not found")


@router.get("/projects/{project_id}/facts/{fact_id}/evidence")
def get_fact_evidence(project_id: str, fact_id: str, db: Session = Depends(get_session)):
    """Get evidence for a fact: fact text, evidence_snippet (source excerpt), sources (domain, url, title, excerpt, source_type), offsets."""
    p_uuid = UUID(project_id)
    f_uuid = UUID(fact_id)
    node = db.get(ResearchNode, f_uuid)
    if not node or node.project_id != p_uuid:
        raise HTTPException(status_code=404, detail="Fact not found")
    source = db.get(SourceDoc, node.source_doc_id)
    excerpt = (node.quote_text_raw or node.fact_text)[:280] if node.quote_text_raw or node.fact_text else None
    evidence_snippet = getattr(node, "evidence_snippet", None)
    primary_url = getattr(node, "source_url", None) or (source.url if source else "")
    source_type = getattr(source, "source_type", None)
    source_type_val = source_type.value if source_type and hasattr(source_type, "value") else (source_type or "WEB")
    return {
        "fact_id": str(node.id),
        "fact_text": node.fact_text,
        "evidence_snippet": evidence_snippet,
        "evidence_start_char_raw": getattr(node, "evidence_start_char_raw", None),
        "evidence_end_char_raw": getattr(node, "evidence_end_char_raw", None),
        "evidence_start_char_md": getattr(node, "evidence_start_char_md", None),
        "evidence_end_char_md": getattr(node, "evidence_end_char_md", None),
        "sources": [
            {
                "domain": source.domain if source else "Unknown",
                "url": primary_url,
                "title": source.title if source else None,
                "excerpt": excerpt,
                "source_type": source_type_val,
            }
        ],
        "highlights": [node.quote_text_raw] if node.quote_text_raw else None,
        "updated_at": node.created_at.isoformat() if node.created_at else None,
    }


class CaptureExcerptRequest(BaseModel):
    source_url: str
    format: str  # "raw" | "markdown"
    start: int
    end: int


@router.post("/projects/{project_id}/facts/{fact_id}/capture_excerpt")
def capture_excerpt(
    project_id: str,
    fact_id: str,
    body: CaptureExcerptRequest,
    db: Session = Depends(get_session),
):
    """
    Capture a source excerpt for a fact. Validates range, fetches source content from DB,
    extracts substring, stores evidence_snippet + offsets.
    Returns 409 if source content not available.
    """
    MAX_RANGE = 1200
    if body.start >= body.end:
        raise HTTPException(status_code=400, detail="start must be less than end")
    if body.end - body.start > MAX_RANGE:
        raise HTTPException(status_code=400, detail=f"Range size must be <= {MAX_RANGE} chars")
    fmt = (body.format or "raw").lower()
    if fmt not in ("raw", "markdown"):
        raise HTTPException(status_code=400, detail="format must be 'raw' or 'markdown'")

    p_uuid = UUID(project_id)
    f_uuid = UUID(fact_id)
    node = db.get(ResearchNode, f_uuid)
    if not node or node.project_id != p_uuid:
        raise HTTPException(status_code=404, detail="Fact not found")

    statement = select(SourceDoc).where(
        SourceDoc.project_id == p_uuid,
        SourceDoc.url == body.source_url,
    )
    doc = db.exec(statement).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Source document not found")

    content = doc.content_text_raw if fmt == "raw" else (doc.content_markdown or doc.content_text_raw or doc.content_text)
    if not content or len(content) < body.end:
        raise HTTPException(status_code=409, detail="Source content not available yet")

    excerpt = content[body.start:body.end]
    excerpt = re.sub(r"\s+", " ", excerpt).strip()
    if not excerpt:
        raise HTTPException(status_code=400, detail="Selected range yields empty text")

    node.evidence_snippet = excerpt
    node.quote_text_raw = excerpt
    if fmt == "raw":
        node.evidence_start_char_raw = body.start
        node.evidence_end_char_raw = body.end
        node.evidence_start_char_md = None
        node.evidence_end_char_md = None
    else:
        node.evidence_start_char_md = body.start
        node.evidence_end_char_md = body.end
        node.evidence_start_char_raw = None
        node.evidence_end_char_raw = None

    db.add(node)
    db.commit()
    db.refresh(node)

    source = db.get(SourceDoc, node.source_doc_id)
    return {
        "ok": True,
        "fact": {
            "id": str(node.id),
            "fact_text": node.fact_text,
            "evidence_snippet": node.evidence_snippet,
            "evidence_start_char_raw": node.evidence_start_char_raw,
            "evidence_end_char_raw": node.evidence_end_char_raw,
            "evidence_start_char_md": node.evidence_start_char_md,
            "evidence_end_char_md": node.evidence_end_char_md,
            "source_domain": source.domain if source else "Unknown",
            "source_url": source.url if source else "",
        },
    }


@router.get("/projects/{project_id}/sources/summary")
def get_sources_summary(project_id: str, db: Session = Depends(get_session)):
    """Per-source summary: status, facts_total, key_claims, needs_review, pinned, last_error."""
    p_uuid = UUID(project_id)
    sources_list = db.exec(select(SourceDoc).where(SourceDoc.project_id == p_uuid)).all()
    jobs_list = db.exec(
        select(Job).where(Job.project_id == p_uuid).order_by(desc(Job.created_at))
    ).all()
    url_to_job: Dict[str, Job] = {}
    for j in jobs_list:
        url = (j.params or {}).get("url")
        if url and url not in url_to_job:
            url_to_job[url] = j

    result = []
    for src in sources_list:
        facts_stmt = (
            select(ResearchNode)
            .where(
                ResearchNode.source_doc_id == src.id,
                ResearchNode.is_suppressed.is_not(True),
            )
        )
        facts = list(db.exec(facts_stmt).all())
        job = url_to_job.get(src.url)
        status = "COMPLETED"
        last_error = None
        if job:
            if job.status == JobStatus.FAILED:
                status = "FAILED"
                last_error = (job.result_summary or {}).get("error") if job else None
            elif job.status in (JobStatus.PENDING, JobStatus.RUNNING):
                status = "RUNNING"

        src_type = getattr(src, "source_type", None)
        src_type_val = src_type.value if src_type and hasattr(src_type, "value") else "WEB"
        result.append({
            "source_url": src.url,
            "domain": src.domain,
            "title": src.title or "",
            "status": status,
            "source_type": src_type_val,
            "facts_total": len(facts),
            "key_claims": sum(1 for f in facts if f.is_key_claim),
            "needs_review": sum(1 for f in facts if f.review_status == ReviewStatus.NEEDS_REVIEW),
            "pinned": sum(1 for f in facts if f.is_pinned),
            "last_error": last_error,
        })
    return result


@router.get("/projects/{project_id}/jobs")
def get_project_jobs(project_id: str, db: Session = Depends(get_session)):
    statement = select(Job).where(Job.project_id == UUID(project_id)).order_by(desc(Job.created_at))
    results = db.exec(statement).all()
    return results


class RetrySourceRequest(BaseModel):
    canonical_url: str
    source_type: str  # "WEB" | "REDDIT" | "YOUTUBE"


@router.post("/projects/{project_id}/sources/retry")
def retry_source(project_id: str, body: RetrySourceRequest, db: Session = Depends(get_session)):
    """
    Retry ingestion for a source by canonical_url + source_type.
    Creates a new Job and re-runs ingest (preserves canonical_url and source_type).
    In E2E mode (ARTIFACT_ENABLE_TEST_SEED), sets e2e_retry_ok so worker succeeds with stub.
    """
    from app.workers.celery_app import celery_app
    try:
        p_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project UUID")
    st = (body.source_type or "WEB").upper()
    if st not in ("WEB", "REDDIT", "YOUTUBE"):
        st = "WEB"
    canonical_url = (body.canonical_url or "").strip()
    if not canonical_url:
        raise HTTPException(status_code=400, detail="canonical_url required")
    project = db.get(Project, p_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    e2e_retry_ok = os.getenv("ARTIFACT_ENABLE_TEST_SEED", "false").lower() == "true"
    job = Job(
        id=uuid.uuid4(),
        project_id=p_uuid,
        workspace_id=project.workspace_id,
        type="url_ingest",
        status=JobStatus.PENDING,
        idempotency_key=f"{project_id}:retry:{uuid.uuid4()}",
        current_step="QUEUED",
        params={
            "url": canonical_url,
            "canonical_url": canonical_url,
            "source_type": st,
            "e2e_retry_ok": e2e_retry_ok,
        },
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    celery_app.send_task("ingest_url", args=[str(job.id), canonical_url])
    return {"job_id": str(job.id)}


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
        fact_dicts = [f.model_dump() for f in payload.facts]
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
    """Deterministic synthesis for E2E: obviously different content per mode."""
    raw = (payload.mode or "paragraph").lower()
    mode = raw
    if raw == "research_brief":
        mode = "brief"
    elif raw == "script_outline":
        mode = "outline"
    sources = len(set(f.url for f in payload.facts if f.url))
    footer_mode = {"paragraph": "paragraph", "brief": "research_brief", "outline": "script_outline", "split": "split_sections"}.get(mode, mode)
    footer = f"Sources: {sources} | Mode: {footer_mode}"

    if mode == "split":
        lines = ["E2E Synthesis - Separate Sections", ""]
        for i, f in enumerate(payload.facts[:10], 1):
            lines.append(f"## Section {i}: {(f.title or 'Item')[:30]}")
            lines.append(f"- {f.text}")
            lines.append("")
        lines.append(footer)
        return "\n".join(lines).strip()

    if mode == "outline":
        lines = ["E2E Script Outline", "", "## Hook", "Opening from selected facts.", "", "## Beat 1", (payload.facts[0].text if payload.facts else ""), "", "## Beat 2", (payload.facts[1].text if len(payload.facts) > 1 else ""), "", "## Beat 3", (payload.facts[2].text if len(payload.facts) > 2 else ""), "", "## CTA", "Conclusion.", "", footer]
        return "\n".join(lines)

    if mode == "brief":
        lines = ["E2E Research Brief", "", "## Background", "Context from selected sources.", "", "## Findings", *(f"- {f.text}" for f in payload.facts), "", "## Implications", "Summary implications.", "", "## Open Questions", "None.", "", footer]
        return "\n".join(lines)

    # paragraph: 2–3 paragraphs (obviously different from bullets)
    p1 = " ".join(f.text for f in payload.facts[:2])[:200] if payload.facts else "No facts."
    p2 = " ".join(f.text for f in payload.facts[2:4])[:200] if len(payload.facts) > 2 else "Further context."
    p3 = "Conclusion from synthesis." if len(payload.facts) > 1 else ""
    lines = ["E2E Synthesis", "", p1, "", p2]
    if p3:
        lines.extend(["", p3])
    lines.extend(["", footer])
    return "\n".join(lines)


@router.post("/projects/{project_id}/synthesize")
def synthesize_project_facts(
    project_id: str,
    payload: SynthesisRequest,
    request: Request,
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
        fact_dicts = [f.model_dump() for f in payload.facts]
        e2e = _e2e_mode_enabled()
        
        # Check for force-error via header (preferred) or query param (legacy)
        force_error_header = request.headers.get("x-e2e-force-error", "").lower() == "true"
        should_force_error = force_error or force_error_header

        # E2E + force_error: simulate empty synthesis for error test (no 500)
        if e2e and should_force_error:
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
            llm_mode = (payload.mode or "paragraph").lower()
            if llm_mode == "research_brief":
                llm_mode = "brief"
            elif llm_mode == "script_outline":
                llm_mode = "outline"
            result = llm_synthesize(fact_dicts, llm_mode)

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

        mode_titles = {
            "paragraph": "Synthesis",
            "outline": "Script Outline",
            "script_outline": "Script Outline",
            "brief": "Research Brief",
            "research_brief": "Research Brief",
            "split": "Separate Sections",
        }
        raw_mode = (payload.mode or "paragraph").lower()
        mode_key = "research_brief" if raw_mode == "brief" else "script_outline" if raw_mode == "outline" else raw_mode
        title = f"{mode_titles.get(mode_key, mode_titles.get(raw_mode, 'Output'))} - {datetime.now(timezone.utc).strftime('%b %d, %Y at %I:%M %p')}"
        output_type = "synthesis"
        if mode_key in ("outline", "script_outline"):
            output_type = "script_outline"
        elif mode_key in ("brief", "research_brief"):
            output_type = "research_brief"
        elif mode_key == "split":
            output_type = "split_sections"
        persist_mode = "paragraph" if mode_key == "paragraph" else "research_brief" if output_type == "research_brief" else "script_outline" if output_type == "script_outline" else "split"

        # Compute quality_stats from facts passed
        approved = sum(1 for f in payload.facts if getattr(f, "review_status", None) == "APPROVED")
        needs_review = sum(1 for f in payload.facts if getattr(f, "review_status", None) == "NEEDS_REVIEW")
        flagged = sum(1 for f in payload.facts if getattr(f, "review_status", None) == "FLAGGED")
        rejected = sum(1 for f in payload.facts if getattr(f, "review_status", None) == "REJECTED")
        pinned = sum(1 for f in payload.facts if getattr(f, "is_pinned", False))
        quality_stats = {
            "total": len(payload.facts),
            "approved": approved,
            "needs_review": needs_review,
            "flagged": flagged,
            "rejected": rejected,
            "pinned": pinned,
        }

        output = Output(
            project_id=UUID(project_id),
            title=title,
            content=synthesis_text,
            output_type=output_type,
            mode=persist_mode,
            fact_ids=[f.id for f in payload.facts],
            source_count=len(set(f.url for f in payload.facts if f.url)),
            quality_stats=quality_stats,
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
def get_project_outputs(
    project_id: str,
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_session),
):
    """List outputs for a project (summary: id, title, created_at, source_count, fact_ids_count, preview, mode)."""
    try:
        pid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project_id")
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 100")
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0")

    project = db.get(Project, pid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    statement = (
        select(Output)
        .where(Output.project_id == pid)
        .order_by(desc(Output.created_at))
        .offset(offset)
        .limit(limit)
    )
    results = db.exec(statement).all()
    items = []
    for o in results:
        fact_ids_count = len(o.fact_ids) if isinstance(o.fact_ids, list) else 0
        preview = (o.content or "")[:160].replace("\n", " ") if o.content else ""
        items.append({
            "id": str(o.id),
            "title": o.title,
            "created_at": o.created_at.isoformat() if o.created_at else None,
            "source_count": o.source_count or 0,
            "fact_ids_count": fact_ids_count,
            "preview": preview,
            "mode": o.mode or "paragraph",
            "is_pinned": getattr(o, "is_pinned", False) or False,
            "quality_stats": getattr(o, "quality_stats", None),
        })
    return items


class OutputPatch(BaseModel):
    is_pinned: Optional[bool] = None


@router.patch("/outputs/{output_id}")
def patch_output(output_id: str, body: OutputPatch, db: Session = Depends(get_session)):
    """Update an output (e.g. is_pinned)."""
    output = db.get(Output, UUID(output_id))
    if not output:
        raise HTTPException(status_code=404, detail="Output not found")
    if body.is_pinned is not None:
        output.is_pinned = body.is_pinned
    db.add(output)
    db.commit()
    db.refresh(output)
    return output


@router.get("/outputs/{output_id}")
def get_output(output_id: str, db: Session = Depends(get_session)):
    """Get a specific output"""
    output = db.get(Output, UUID(output_id))
    if not output:
        raise HTTPException(status_code=404, detail="Output not found")
    return output


class EvidenceMapFact(BaseModel):
    id: str
    fact_text: str
    review_status: str  # APPROVED | NEEDS_REVIEW | FLAGGED | REJECTED | PENDING
    is_pinned: bool
    is_key_claim: bool
    source_type: Optional[str] = None  # WEB | REDDIT | YOUTUBE
    source_url: Optional[str] = None
    source_domain: Optional[str] = None
    evidence_snippet: Optional[str] = None
    has_excerpt: bool
    evidence_start_char_raw: Optional[int] = None
    evidence_end_char_raw: Optional[int] = None


class EvidenceMapSource(BaseModel):
    domain: str
    url: str
    source_type: Optional[str] = None


class OutputEvidenceMapResponse(BaseModel):
    output_id: str
    facts: List[EvidenceMapFact]
    sources: List[EvidenceMapSource]


@router.get("/outputs/{output_id}/evidence_map", response_model=OutputEvidenceMapResponse)
def get_output_evidence_map(output_id: str, db: Session = Depends(get_session)):
    """
    Get evidence map for an output: facts used (with status, excerpt, source) and unique sources.
    Single query for facts by output.fact_ids + join SourceDoc.
    """
    output = db.get(Output, UUID(output_id))
    if not output:
        raise HTTPException(status_code=404, detail="Output not found")

    fact_ids_raw = output.fact_ids or []
    if not fact_ids_raw:
        return OutputEvidenceMapResponse(
            output_id=str(output.id),
            facts=[],
            sources=[],
        )

    try:
        fact_uuids = [UUID(fid) for fid in fact_ids_raw]
    except (ValueError, TypeError):
        return OutputEvidenceMapResponse(
            output_id=str(output.id),
            facts=[],
            sources=[],
        )

    # Preserve order by fact_ids; fetch nodes and join source in one pass
    order_index = {fid: i for i, fid in enumerate(fact_ids_raw)}
    statement = (
        select(ResearchNode, SourceDoc)
        .join(SourceDoc, ResearchNode.source_doc_id == SourceDoc.id)
        .where(ResearchNode.id.in_(fact_uuids))
    )
    rows = list(db.exec(statement).all())

    # Build facts list (preserve order)
    facts_out: List[EvidenceMapFact] = []
    seen_sources: Dict[Tuple[str, str], EvidenceMapSource] = {}

    for node, source in rows:
        sid = str(node.id)
        # Will sort by order_index after
        snippet = getattr(node, "evidence_snippet", None) or None
        has_excerpt = bool(snippet and str(snippet).strip())
        source_url = getattr(node, "source_url", None) or (source.url if source else None)
        source_domain = source.domain if source else "Unknown"
        source_type_val = getattr(source, "source_type", None)
        source_type_str = source_type_val.value if hasattr(source_type_val, "value") else (str(source_type_val) if source_type_val else None)
        review_status_val = getattr(node, "review_status", None)
        review_status_str = review_status_val.value if hasattr(review_status_val, "value") else (str(review_status_val) if review_status_val else "PENDING")

        facts_out.append(
            EvidenceMapFact(
                id=sid,
                fact_text=node.fact_text or "",
                review_status=review_status_str,
                is_pinned=getattr(node, "is_pinned", False) or False,
                is_key_claim=getattr(node, "is_key_claim", False) or False,
                source_type=source_type_str,
                source_url=source_url,
                source_domain=source_domain,
                evidence_snippet=snippet,
                has_excerpt=has_excerpt,
                evidence_start_char_raw=getattr(node, "evidence_start_char_raw", None),
                evidence_end_char_raw=getattr(node, "evidence_end_char_raw", None),
            )
        )
        key = (source_domain, source_url or "")
        if key not in seen_sources:
            seen_sources[key] = EvidenceMapSource(
                domain=source_domain,
                url=source_url or "",
                source_type=source_type_str,
            )

    facts_out.sort(key=lambda f: order_index.get(f.id, 999))

    sources_list = list(seen_sources.values())

    return OutputEvidenceMapResponse(
        output_id=str(output.id),
        facts=facts_out,
        sources=sources_list,
    )


@router.delete("/outputs/{output_id}")
def delete_output(output_id: str, db: Session = Depends(get_session)):
    """Delete an output"""
    output = db.get(Output, UUID(output_id))
    if not output:
        raise HTTPException(status_code=404, detail="Output not found")
    db.delete(output)
    db.commit()
    return {"status": "ok", "message": "Output deleted"}
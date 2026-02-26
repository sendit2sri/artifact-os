import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from enum import Enum
from sqlmodel import SQLModel, Field, Relationship, JSON, UniqueConstraint
from sqlalchemy import Text

# --- Enums ---

class JobStatus(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"

class IntegrityStatus(str, Enum):
    # Updated to match database enum (uppercase)
    VERIFIED = "VERIFIED"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    FUZZY_MATCH = "FUZZY_MATCH"
    MISSING_CITATION = "MISSING_CITATION"
    REJECTED = "REJECTED"

class NodeType(str, Enum):
    FACT = "FACT"
    CONCEPT = "CONCEPT"

class ReviewStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    NEEDS_REVIEW = "NEEDS_REVIEW"  # Low confidence or fuzzy match
    FLAGGED = "FLAGGED"            # User-marked issues
    REJECTED = "REJECTED"

class SourceType(str, Enum):
    WEB = "WEB"
    REDDIT = "REDDIT"
    YOUTUBE = "YOUTUBE"
    MEDIA = "MEDIA"  # uploaded audio/video

# --- Tables ---

class Workspace(SQLModel, table=True):
    __tablename__ = "workspaces"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str
    settings: Dict[str, Any] = Field(default_factory=dict, sa_type=JSON)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    projects: List["Project"] = Relationship(back_populates="workspace")

class Project(SQLModel, table=True):
    __tablename__ = "projects"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(foreign_key="workspaces.id", index=True)
    title: str
    storage_path_root: str 
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    workspace: Workspace = Relationship(back_populates="projects")
    nodes: List["ResearchNode"] = Relationship(back_populates="project")
    canvas_state: Optional["CanvasState"] = Relationship(back_populates="project")
    jobs: List["Job"] = Relationship(back_populates="project")

class SourceDoc(SQLModel, table=True):
    __tablename__ = "source_docs"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    project_id: uuid.UUID = Field(foreign_key="projects.id", index=True)
    workspace_id: uuid.UUID = Field(foreign_key="workspaces.id")
    
    url: str
    domain: str
    title: Optional[str] = Field(default=None)
    
    # Multi-source: type and normalized URL
    source_type: SourceType = Field(default=SourceType.WEB)
    canonical_url: Optional[str] = Field(default=None)
    metadata_json: Optional[Dict[str, Any]] = Field(default=None, sa_type=JSON)
    
    # Store full text (using Text type for large content)
    # Legacy field - kept for backward compatibility
    content_text: Optional[str] = Field(default=None, sa_type=Text)
    
    # ✅ NEW: Multiple content representations for better Reader view
    content_text_raw: Optional[str] = Field(default=None, sa_type=Text)  # Raw extracted text
    content_markdown: Optional[str] = Field(default=None, sa_type=Text)  # Clean markdown when available
    content_html_clean: Optional[str] = Field(default=None, sa_type=Text)  # Cleaned HTML
    
    # ✅ FIX 1: Make these Optional to prevent "NotNullViolation" crashes
    content_s3_path: Optional[str] = Field(default=None)
    content_hash: Optional[str] = Field(default=None, index=True)
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ResearchNode(SQLModel, table=True):
    __tablename__ = "research_nodes"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    project_id: uuid.UUID = Field(foreign_key="projects.id", index=True)
    source_doc_id: uuid.UUID = Field(foreign_key="source_docs.id")
    
    type: NodeType = Field(default=NodeType.FACT)
    
    fact_text: str
    
    # ✅ FIX 2: Make quote fields optional. 
    # If extraction finds a fact but no direct quote, we still want to save it.
    quote_text_raw: Optional[str] = Field(default=None)
    quote_hash: Optional[str] = Field(default=None)
    # Source excerpt (2–3 sentences) shown in Evidence panel; distinct from fact_text.
    evidence_snippet: Optional[str] = Field(default=None, sa_type=Text)
    
    # Evidence offset anchors for precise highlighting
    evidence_start_char_raw: Optional[int] = Field(default=None)  # Offset in content_text_raw
    evidence_end_char_raw: Optional[int] = Field(default=None)    # Offset in content_text_raw
    evidence_start_char_md: Optional[int] = Field(default=None)   # Offset in content_markdown (if exists)
    evidence_end_char_md: Optional[int] = Field(default=None)     # Offset in content_markdown (if exists)
    
    # Per-fact source link (Reddit comment permalink, YouTube watch URL, etc.)
    source_url: Optional[str] = Field(default=None)
    
    confidence_score: int = Field(default=0)
    
    # Uses the updated IntegrityStatus Enum
    integrity_status: IntegrityStatus = Field(default=IntegrityStatus.NEEDS_REVIEW)
    
    section_context: Optional[str] = None
    tags: List[str] = Field(default_factory=list, sa_type=JSON)
    is_key_claim: bool = Field(default=False)

    is_quarantined: bool = Field(default=False)
    review_status: ReviewStatus = Field(default=ReviewStatus.PENDING)
    is_pinned: bool = Field(default=False)
    duplicate_group_id: Optional[uuid.UUID] = Field(default=None)
    is_suppressed: bool = Field(default=False)
    canonical_fact_id: Optional[uuid.UUID] = Field(default=None)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    project: Project = Relationship(back_populates="nodes")

class CanvasState(SQLModel, table=True):
    __tablename__ = "canvas_states"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    project_id: uuid.UUID = Field(foreign_key="projects.id", unique=True)
    version: int = Field(default=1)
    layout_state: Dict[str, Any] = Field(default_factory=dict, sa_type=JSON)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    project: Project = Relationship(back_populates="canvas_state")

class Job(SQLModel, table=True):
    __tablename__ = "jobs"
    __table_args__ = (UniqueConstraint("project_id", "idempotency_key", name="unique_job_idempotency"),)
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(foreign_key="workspaces.id")
    project_id: Optional[uuid.UUID] = Field(default=None, foreign_key="projects.id")
    
    type: str 
    status: JobStatus = Field(default=JobStatus.PENDING)
    idempotency_key: str 
    
    current_step: str = Field(default="Queued")
    steps_completed: int = Field(default=0)
    steps_total: int = Field(default=5)
    
    params: Dict[str, Any] = Field(default_factory=dict, sa_type=JSON)
    result_summary: Dict[str, Any] = Field(default_factory=dict, sa_type=JSON)
    
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    project: Optional[Project] = Relationship(back_populates="jobs")

class IngestRule(SQLModel, table=True):
    """Auto-ingest rules (V4): folder_watch, rss_ingest, scheduled_url. Worker picks up in V4b."""
    __tablename__ = "ingest_rules"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    project_id: uuid.UUID = Field(foreign_key="projects.id", index=True)
    type: str = Field(index=True)  # folder_watch | rss_ingest | scheduled_url
    config_json: Dict[str, Any] = Field(default_factory=dict, sa_type=JSON)
    enabled: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class UserPreference(SQLModel, table=True):
    """Server-backed user preferences per workspace/project (key-value JSON)."""
    __tablename__ = "user_preferences"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(foreign_key="workspaces.id", index=True)
    project_id: Optional[uuid.UUID] = Field(default=None, foreign_key="projects.id", index=True)
    key: str = Field(index=True)
    value_json: Dict[str, Any] = Field(default_factory=dict, sa_type=JSON)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Output(SQLModel, table=True):
    """Stores synthesis/generation outputs for persistent access"""
    __tablename__ = "outputs"
    
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    project_id: uuid.UUID = Field(foreign_key="projects.id", index=True)
    
    title: str
    content: str = Field(sa_type=Text)
    
    # Metadata about the output
    output_type: str = Field(default="synthesis")  # synthesis, outline, brief, etc.
    mode: str = Field(default="paragraph")  # paragraph, outline, brief
    
    # Track which facts were used
    fact_ids: List[str] = Field(default_factory=list, sa_type=JSON)
    source_count: int = Field(default=0)
    
    is_pinned: Optional[bool] = Field(default=False)
    
    # Quality stats: counts by review_status and pinned (computed at synthesis time)
    quality_stats: Optional[Dict[str, Any]] = Field(default=None, sa_type=JSON)
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
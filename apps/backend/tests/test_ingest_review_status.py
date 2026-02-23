"""
Test auto-assignment of review_status based on confidence_score during ingestion.
Mocks extraction to return a fact with confidence that maps to score 60 (needs_review).
"""

import uuid
from unittest.mock import patch, MagicMock

import pytest
from sqlmodel import Session, select

from app.db.session import engine
from app.models import Job, JobStatus, Project, ResearchNode, Workspace
from app.services.llm import ExtractionResult, ExtractedFact
from app.workers.ingest_task import ingest_url_task


@pytest.fixture
def db_session():
    with Session(engine) as session:
        yield session


@pytest.fixture
def test_workspace(db_session):
    ws = Workspace(id=uuid.uuid4(), name="Test Workspace", settings={})
    db_session.add(ws)
    db_session.commit()
    db_session.refresh(ws)
    return ws


@pytest.fixture
def test_project(db_session, test_workspace):
    proj = Project(
        id=uuid.uuid4(),
        workspace_id=test_workspace.id,
        title="Test Project",
        storage_path_root="test/review_status",
    )
    db_session.add(proj)
    db_session.commit()
    db_session.refresh(proj)
    return proj


@pytest.fixture
def test_job(db_session, test_project, test_workspace):
    job = Job(
        id=uuid.uuid4(),
        project_id=test_project.id,
        workspace_id=test_workspace.id,
        type="url_ingest",
        status=JobStatus.PENDING,
        idempotency_key=f"{test_project.id}:https://example.com/test",
        params={
            "url": "https://example.com/test",
            "canonical_url": "https://example.com/test",
            "source_type": "WEB",
        },
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)
    return job


def test_review_status_needs_review_when_confidence_60(db_session, test_project, test_job):
    """When extraction returns confidence MEDIUM (score 60), saved node has review_status NEEDS_REVIEW."""
    mock_result = ExtractionResult(
        facts=[
            ExtractedFact(
                fact_text="Test fact with medium confidence.",
                quote_span="Test fact",
                confidence="MEDIUM",
                section_context="Test",
                tags=[],
                is_key_claim=False,
            )
        ],
        summary_brief=["Summary"],
    )

    with (
        patch("app.workers.ingest_task.requests.get") as mock_get,
        patch("app.workers.ingest_task.extract") as mock_extract,
        patch("app.workers.ingest_task.extract_facts_from_markdown", return_value=mock_result),
        patch("app.workers.ingest_task._resolve_fact_source_url", return_value=(None, None)),
    ):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.text = "<html><body><p>Test fact with medium confidence.</p></body></html>"
        mock_get.return_value = mock_resp

        mock_extract.return_value = {
            "text_raw": "Test fact with medium confidence.",
            "markdown": "Test fact with medium confidence.",
            "title": "Test Page",
        }

        ingest_url_task(None, str(test_job.id), "https://example.com/test")

    db_session.expire_all()
    nodes = db_session.exec(select(ResearchNode).where(ResearchNode.project_id == test_project.id)).all()
    assert len(nodes) == 1
    assert nodes[0].review_status.value == "NEEDS_REVIEW"
    assert nodes[0].confidence_score == 60

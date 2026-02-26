"""
YouTube ingest worker tests. Fixtures-based; no network.
With captions: job completes, SourceDoc + facts. Without captions: job FAILED, CAPTIONS_UNAVAILABLE.
"""

import uuid
from unittest.mock import patch, MagicMock

import pytest
from sqlmodel import Session, select

from app.db.session import engine
from app.models import Job, JobStatus, Project, ResearchNode, SourceDoc, Workspace
from app.services.llm import ExtractionResult, ExtractedFact
from app.workers.ingest_task import ingest_url_task

from tests.fixtures.youtube import load_fixture, segments_for_fetcher


URL_WITH_CAPTIONS = "https://www.youtube.com/watch?v=6MBq1paspVU"
URL_WITHOUT_CAPTIONS = "https://www.youtube.com/watch?v=HpMPhOtT3Ow"


def _fixture_to_worker_transcript(video_id: str):
    """Convert fixture segments to worker-expected format: [{start_s, end_s, text}]."""
    fixture = load_fixture(video_id)
    raw = segments_for_fetcher(fixture)
    if not raw:
        return []
    return [
        {"start_s": s["start"], "end_s": s["start"] + s["duration"], "text": s.get("text", "")}
        for s in raw
    ]


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
        storage_path_root="test/youtube_ingest",
    )
    db_session.add(proj)
    db_session.commit()
    db_session.refresh(proj)
    return proj


@pytest.fixture
def test_job_youtube(db_session, test_project, test_workspace):
    job = Job(
        id=uuid.uuid4(),
        project_id=test_project.id,
        workspace_id=test_workspace.id,
        type="url_ingest",
        status=JobStatus.PENDING,
        idempotency_key=f"{test_project.id}:{URL_WITH_CAPTIONS}",
        params={
            "url": URL_WITH_CAPTIONS,
            "canonical_url": URL_WITH_CAPTIONS,
            "source_type": "YOUTUBE",
        },
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)
    return job


@pytest.fixture
def test_job_youtube_no_captions(db_session, test_project, test_workspace):
    job = Job(
        id=uuid.uuid4(),
        project_id=test_project.id,
        workspace_id=test_workspace.id,
        type="url_ingest",
        status=JobStatus.PENDING,
        idempotency_key=f"{test_project.id}:{URL_WITHOUT_CAPTIONS}",
        params={
            "url": URL_WITHOUT_CAPTIONS,
            "canonical_url": URL_WITHOUT_CAPTIONS,
            "source_type": "YOUTUBE",
        },
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)
    return job


def test_youtube_ingest_with_captions_completes(db_session, test_project, test_job_youtube):
    """YouTube URL with captions: transcript stored, facts extracted, job COMPLETED."""
    transcript = _fixture_to_worker_transcript("6MBq1paspVU")
    mock_result = ExtractionResult(
        facts=[
            ExtractedFact(
                fact_text="Lithium mining has environmental impact.",
                quote_span="lithium mining",
                confidence="HIGH",
                section_context="0-12",
                tags=[],
                is_key_claim=True,
            )
        ],
        summary_brief=["Summary"],
    )

    with (
        patch("app.workers.ingest_task.extract") as mock_extract,
        patch("app.workers.ingest_task.extract_facts_from_markdown", return_value=mock_result),
        patch("app.workers.ingest_task._resolve_fact_source_url", return_value=("yt:0-12", URL_WITH_CAPTIONS)),
    ):
        mock_extract.return_value = {
            "title": "Lithium Mining Video",
            "video_url": URL_WITH_CAPTIONS,
            "transcript": transcript,
        }
        ingest_url_task(None, str(test_job_youtube.id), URL_WITH_CAPTIONS)

    db_session.expire_all()
    job = db_session.get(Job, test_job_youtube.id)
    assert job is not None
    assert job.status == JobStatus.COMPLETED
    assert job.result_summary.get("source_type") == "YOUTUBE"

    docs = db_session.exec(select(SourceDoc).where(SourceDoc.project_id == test_project.id)).all()
    assert len(docs) == 1
    assert "lithium" in (docs[0].content_text or "").lower()

    nodes = db_session.exec(select(ResearchNode).where(ResearchNode.project_id == test_project.id)).all()
    assert len(nodes) >= 1


def test_youtube_ingest_without_captions_returns_captions_unavailable(
    db_session, test_project, test_job_youtube_no_captions
):
    """YouTube URL without captions: job FAILED, error_code CAPTIONS_UNAVAILABLE, message suggests upload audio."""
    with patch("app.workers.ingest_task.extract") as mock_extract:
        mock_extract.return_value = {
            "title": "YouTube video HpMPhOtT3Ow",
            "video_url": URL_WITHOUT_CAPTIONS,
            "transcript": [],
        }
        ingest_url_task(None, str(test_job_youtube_no_captions.id), URL_WITHOUT_CAPTIONS)

    db_session.expire_all()
    job = db_session.get(Job, test_job_youtube_no_captions.id)
    assert job is not None
    assert job.status == JobStatus.FAILED
    assert job.result_summary.get("error_code") == "CAPTIONS_UNAVAILABLE"
    assert "upload audio" in (job.result_summary.get("error_message") or "").lower()

    docs = db_session.exec(select(SourceDoc).where(SourceDoc.project_id == test_project.id)).all()
    assert len(docs) == 0

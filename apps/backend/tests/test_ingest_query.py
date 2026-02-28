"""Scira query ingest endpoint tests (mock search provider, no network)."""
import os
import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db.session import engine, get_session
from app.main import app
from app.models import Project, SciraUsage, Workspace
from app.search.mock import MockSearchProvider


@pytest.fixture
def db_session():
    with Session(engine) as session:
        yield session


@pytest.fixture
def client(db_session):
    def override_get_session():
        yield db_session

    from app.api import ingest
    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[ingest.get_search_provider] = lambda: MockSearchProvider()
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.clear()


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
        storage_path_root="test/scira",
    )
    db_session.add(proj)
    db_session.commit()
    db_session.refresh(proj)
    return proj


def test_ingest_query_feature_disabled(client, test_project):
    """When SCIRA_QUERY_INGEST_ENABLED is not set, returns 403."""
    r = client.post(
        f"/api/v1/projects/{test_project.id}/ingest/query",
        json={"workspace_id": str(test_project.workspace_id), "query": "test"},
    )
    assert r.status_code == 403
    assert "not enabled" in r.json()["detail"].lower()


def test_ingest_query_missing_query(client, test_project):
    """Missing or empty query returns 400."""
    os.environ["SCIRA_QUERY_INGEST_ENABLED"] = "true"
    try:
        r = client.post(
            f"/api/v1/projects/{test_project.id}/ingest/query",
            json={"workspace_id": str(test_project.workspace_id), "query": ""},
        )
        assert r.status_code == 400
    finally:
        os.environ.pop("SCIRA_QUERY_INGEST_ENABLED", None)


def test_ingest_query_project_not_found(client, test_workspace):
    """Unknown project_id returns 404."""
    os.environ["SCIRA_QUERY_INGEST_ENABLED"] = "true"
    try:
        fake_id = uuid.uuid4()
        r = client.post(
            f"/api/v1/projects/{fake_id}/ingest/query",
            json={"workspace_id": str(test_workspace.id), "query": "test"},
        )
        assert r.status_code == 404
    finally:
        os.environ.pop("SCIRA_QUERY_INGEST_ENABLED", None)


def test_ingest_query_rate_limited(client, test_project, db_session):
    """When project has recent Scira usage, returns 429."""
    os.environ["SCIRA_QUERY_INGEST_ENABLED"] = "true"
    usage = SciraUsage(
        project_id=test_project.id,
        last_used_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    db_session.add(usage)
    db_session.commit()
    try:
        r = client.post(
            f"/api/v1/projects/{test_project.id}/ingest/query",
            json={"workspace_id": str(test_project.workspace_id), "query": "test"},
        )
        assert r.status_code == 429
        assert "try again" in r.json()["detail"].lower()
    finally:
        os.environ.pop("SCIRA_QUERY_INGEST_ENABLED", None)


@patch("app.services.scira.celery_app.send_task")
def test_ingest_query_success(mock_send_task, client, test_project):
    """With feature on and mock provider, returns 200 and enqueues jobs (no Redis)."""
    mock_send_task.return_value = None
    os.environ["SCIRA_QUERY_INGEST_ENABLED"] = "true"
    try:
        r = client.post(
            f"/api/v1/projects/{test_project.id}/ingest/query",
            json={
                "workspace_id": str(test_project.workspace_id),
                "query": "test query",
                "max_urls": 3,
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data["query"] == "test query"
        assert data["urls_found"] == 3
        assert data["urls_enqueued"] == 3
        assert data["urls_skipped_duplicate"] == 0
        assert len(data["job_ids"]) == 3
        assert len(data["jobs"]) == 3
        assert mock_send_task.call_count == 3
        for job in data["jobs"]:
            assert job["type"] == "url_ingest"
            assert job["status"] == "PENDING"
            assert "url" in job["params"]
    finally:
        os.environ.pop("SCIRA_QUERY_INGEST_ENABLED", None)


@patch("app.services.scira.celery_app.send_task")
def test_ingest_query_max_urls_capped(mock_send_task, client, test_workspace, db_session):
    """max_urls is capped at 5 (use fresh project to avoid rate limit; no Redis)."""
    mock_send_task.return_value = None
    proj = Project(
        id=uuid.uuid4(),
        workspace_id=test_workspace.id,
        title="Other Project",
        storage_path_root="test/scira2",
    )
    db_session.add(proj)
    db_session.commit()
    db_session.refresh(proj)
    os.environ["SCIRA_QUERY_INGEST_ENABLED"] = "true"
    try:
        r = client.post(
            f"/api/v1/projects/{proj.id}/ingest/query",
            json={
                "workspace_id": str(proj.workspace_id),
                "query": "test",
                "max_urls": 10,
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data["urls_found"] == 5
        assert len(data["job_ids"]) <= 5
    finally:
        os.environ.pop("SCIRA_QUERY_INGEST_ENABLED", None)

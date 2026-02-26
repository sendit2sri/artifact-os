"""V4a: Ingest rules CRUD API tests."""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db.session import engine
from app.main import app
from app.models import IngestRule, Project, Workspace


@pytest.fixture
def db_session():
    with Session(engine) as session:
        yield session


@pytest.fixture
def client(db_session):
    def override_get_session():
        yield db_session

    from app.db.session import get_session
    app.dependency_overrides[get_session] = override_get_session
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
        storage_path_root="test/ingest_rules",
    )
    db_session.add(proj)
    db_session.commit()
    db_session.refresh(proj)
    return proj


def test_list_ingest_rules_empty(client, test_project):
    """List rules returns empty list for project with no rules."""
    r = client.get(f"/api/v1/projects/{test_project.id}/ingest-rules")
    assert r.status_code == 200
    assert r.json() == []


def test_create_and_list_ingest_rule(client, test_project):
    """Create rss_ingest rule, list returns it."""
    payload = {"type": "rss_ingest", "config_json": {"url": "https://example.com/feed.xml"}}
    r = client.post(f"/api/v1/projects/{test_project.id}/ingest-rules", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert data["type"] == "rss_ingest"
    assert data["config_json"] == {"url": "https://example.com/feed.xml"}
    assert data["enabled"] is True
    rule_id = data["id"]

    r2 = client.get(f"/api/v1/projects/{test_project.id}/ingest-rules")
    assert r2.status_code == 200
    items = r2.json()
    assert len(items) == 1
    assert items[0]["id"] == rule_id
    assert items[0]["type"] == "rss_ingest"


def test_create_invalid_type(client, test_project):
    """Create with invalid type returns 400."""
    r = client.post(f"/api/v1/projects/{test_project.id}/ingest-rules", json={"type": "invalid"})
    assert r.status_code == 400


def test_delete_ingest_rule(client, test_project, db_session):
    """Create rule, delete it, list returns empty."""
    rule = IngestRule(project_id=test_project.id, type="folder_watch", config_json={"path": "/tmp"})
    db_session.add(rule)
    db_session.commit()
    db_session.refresh(rule)

    r = client.delete(f"/api/v1/projects/{test_project.id}/ingest-rules/{rule.id}")
    assert r.status_code == 200

    r2 = client.get(f"/api/v1/projects/{test_project.id}/ingest-rules")
    assert r2.status_code == 200
    assert r2.json() == []

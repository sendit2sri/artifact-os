"""
Regression test: is_suppressed filter in get_project_facts.
Ensures default excludes True but includes False/None; show_suppressed=true includes all.
"""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db.session import engine
from app.main import app
from app.models import Project, ResearchNode, SourceDoc, Workspace


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
        storage_path_root="test/is_suppressed",
    )
    db_session.add(proj)
    db_session.commit()
    db_session.refresh(proj)
    return proj


@pytest.fixture
def test_source(db_session, test_project, test_workspace):
    doc = SourceDoc(
        id=uuid.uuid4(),
        project_id=test_project.id,
        workspace_id=test_workspace.id,
        url="https://example.com/test",
        domain="example.com",
        title="Test",
    )
    db_session.add(doc)
    db_session.commit()
    db_session.refresh(doc)
    return doc


@pytest.fixture
def seeded_facts(db_session, test_project, test_source):
    """Seed 3 facts: is_suppressed=False, None, True."""
    facts = []
    for i, suppressed in enumerate([False, None, True]):
        node = ResearchNode(
            project_id=test_project.id,
            source_doc_id=test_source.id,
            fact_text=f"Fact {i} (suppressed={suppressed})",
            is_suppressed=suppressed,
        )
        db_session.add(node)
        facts.append(node)
    db_session.commit()
    for n in facts:
        db_session.refresh(n)
    return facts


def test_default_excludes_suppressed(client, test_project, seeded_facts):
    """Default show_suppressed=False excludes True, includes False and None."""
    r = client.get(f"/api/v1/projects/{test_project.id}/facts?filter=all")
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", data)
    assert len(items) == 2, "Should return 2 facts (False and None), not 3 (True excluded)"


def test_show_suppressed_includes_all(client, test_project, seeded_facts):
    """show_suppressed=true includes all 3 facts."""
    r = client.get(f"/api/v1/projects/{test_project.id}/facts?filter=all&show_suppressed=true")
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", data)
    assert len(items) == 3, "Should return all 3 facts when show_suppressed=true"

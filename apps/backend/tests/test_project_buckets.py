"""TicNote V2b: Project buckets GET/PUT API tests."""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.db.session import engine
from app.main import app
from app.models import Project, Workspace


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
        storage_path_root="test/buckets",
    )
    db_session.add(proj)
    db_session.commit()
    db_session.refresh(proj)
    return proj


def test_get_buckets_empty(client, test_project):
    """GET buckets for project with no set returns empty list."""
    r = client.get(f"/api/v1/projects/{test_project.id}/buckets")
    assert r.status_code == 200
    assert r.json() == {"buckets": []}


def test_put_and_get_buckets(client, test_project):
    """PUT one bucket with two fact_ids, GET returns same."""
    bid = str(uuid.uuid4())
    f1, f2 = str(uuid.uuid4()), str(uuid.uuid4())
    payload = {
        "buckets": [
            {"id": bid, "name": "Angle 1", "factIds": [f1, f2], "position": 0}
        ]
    }
    r = client.put(f"/api/v1/projects/{test_project.id}/buckets", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert len(data["buckets"]) == 1
    assert data["buckets"][0]["id"] == bid
    assert data["buckets"][0]["name"] == "Angle 1"
    assert data["buckets"][0]["factIds"] == [f1, f2]

    r2 = client.get(f"/api/v1/projects/{test_project.id}/buckets")
    assert r2.status_code == 200
    assert r2.json() == data


def test_put_replace_buckets(client, test_project):
    """PUT then PUT again with different payload; GET returns second."""
    bid1 = str(uuid.uuid4())
    payload1 = {"buckets": [{"id": bid1, "name": "First", "factIds": []}]}
    r1 = client.put(f"/api/v1/projects/{test_project.id}/buckets", json=payload1)
    assert r1.status_code == 200

    bid2 = str(uuid.uuid4())
    payload2 = {"buckets": [{"id": bid2, "name": "Second", "factIds": []}]}
    r2 = client.put(f"/api/v1/projects/{test_project.id}/buckets", json=payload2)
    assert r2.status_code == 200
    assert r2.json()["buckets"][0]["id"] == bid2
    assert r2.json()["buckets"][0]["name"] == "Second"

    r3 = client.get(f"/api/v1/projects/{test_project.id}/buckets")
    assert r3.status_code == 200
    assert len(r3.json()["buckets"]) == 1
    assert r3.json()["buckets"][0]["id"] == bid2


def test_put_empty_clears(client, test_project):
    """PUT with empty buckets list clears all."""
    payload = {"buckets": [{"id": str(uuid.uuid4()), "name": "X", "factIds": []}]}
    client.put(f"/api/v1/projects/{test_project.id}/buckets", json=payload)
    r = client.put(f"/api/v1/projects/{test_project.id}/buckets", json={"buckets": []})
    assert r.status_code == 200
    assert r.json() == {"buckets": []}
    r2 = client.get(f"/api/v1/projects/{test_project.id}/buckets")
    assert r2.json() == {"buckets": []}


def test_get_buckets_404(client):
    """GET buckets for invalid project_id returns 404."""
    r = client.get(f"/api/v1/projects/{uuid.uuid4()}/buckets")
    assert r.status_code == 404


def test_put_buckets_404(client):
    """PUT buckets for invalid project_id returns 404."""
    r = client.put(
        f"/api/v1/projects/{uuid.uuid4()}/buckets",
        json={"buckets": [{"id": str(uuid.uuid4()), "name": "A", "factIds": []}]},
    )
    assert r.status_code == 404


def test_put_buckets_400_empty_name(client, test_project):
    """PUT with empty bucket name returns 400."""
    r = client.put(
        f"/api/v1/projects/{test_project.id}/buckets",
        json={"buckets": [{"id": str(uuid.uuid4()), "name": "  ", "factIds": []}]},
    )
    assert r.status_code == 400

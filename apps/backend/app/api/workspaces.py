"""
Workspaces and user preferences API.
E2E mode: deterministic Personal + Team workspaces when auth not implemented.
"""
import os
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, select

from app.db.session import get_session
from app.models import Workspace, Project, UserPreference

router = APIRouter()

# E2E / no-auth: deterministic workspace IDs (same as main.py dev workspace + Team)
E2E_PERSONAL_ID = UUID("123e4567-e89b-12d3-a456-426614174000")
E2E_TEAM_ID = UUID("123e4567-e89b-12d3-a456-426614174001")


def _e2e_mode() -> bool:
    return os.getenv("ARTIFACT_ENABLE_TEST_SEED", "false").lower() == "true"


# --- SCHEMAS ---

class WorkspaceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    created_at: Any


class ProjectSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    workspace_id: UUID
    created_at: Any


class PreferencePut(BaseModel):
    project_id: Optional[str] = None
    key: str
    value_json: Any


# --- ENDPOINTS ---

@router.get("/workspaces", response_model=List[WorkspaceRead])
def list_workspaces(db: Session = Depends(get_session)):
    """
    List workspaces the user can access.
    E2E mode: return deterministic Personal + Team; ensure they exist.
    """
    if _e2e_mode():
        personal = db.get(Workspace, E2E_PERSONAL_ID)
        if not personal:
            personal = Workspace(id=E2E_PERSONAL_ID, name="Personal", settings={})
            db.add(personal)
        else:
            personal.name = "Personal"
            db.add(personal)
        team = db.get(Workspace, E2E_TEAM_ID)
        if not team:
            team = Workspace(id=E2E_TEAM_ID, name="Team", settings={})
            db.add(team)
        else:
            team.name = "Team"
            db.add(team)
        db.commit()
        db.refresh(personal)
        db.refresh(team)
        return [personal, team]
    # Non-E2E: return all workspaces (single-user / dev)
    workspaces = db.exec(select(Workspace).order_by(Workspace.created_at)).all()
    return list(workspaces)


@router.get("/workspaces/{workspace_id}/projects", response_model=List[ProjectSummary])
def list_workspace_projects(workspace_id: str, db: Session = Depends(get_session)):
    """List projects for a workspace."""
    ws_uuid = UUID(workspace_id)
    workspace = db.get(Workspace, ws_uuid)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    projects = db.exec(
        select(Project).where(Project.workspace_id == ws_uuid).order_by(Project.created_at.desc())
    ).all()
    return list(projects)


@router.get("/workspaces/{workspace_id}/preferences")
def get_preferences(
    workspace_id: str,
    project_id: Optional[str] = None,
    db: Session = Depends(get_session),
) -> Dict[str, Any]:
    """Get preferences map { key: value_json } for workspace (and optional project)."""
    ws_uuid = UUID(workspace_id)
    workspace = db.get(Workspace, ws_uuid)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    q = select(UserPreference).where(UserPreference.workspace_id == ws_uuid)
    if project_id:
        q = q.where(UserPreference.project_id == UUID(project_id))
    else:
        q = q.where(UserPreference.project_id.is_(None))
    prefs = db.exec(q).all()
    return {p.key: p.value_json for p in prefs}


@router.put("/workspaces/{workspace_id}/preferences")
def put_preference(
    workspace_id: str,
    payload: PreferencePut,
    db: Session = Depends(get_session),
) -> Dict[str, str]:
    """Upsert a single preference."""
    ws_uuid = UUID(workspace_id)
    workspace = db.get(Workspace, ws_uuid)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    project_uuid = UUID(payload.project_id) if payload.project_id else None
    q = select(UserPreference).where(
        UserPreference.workspace_id == ws_uuid,
        UserPreference.key == payload.key,
    )
    if project_uuid is None:
        q = q.where(UserPreference.project_id.is_(None))
    else:
        q = q.where(UserPreference.project_id == project_uuid)
    existing = db.exec(q).first()
    if existing:
        existing.value_json = payload.value_json
        existing.updated_at = datetime.now(timezone.utc)
        db.add(existing)
    else:
        pref = UserPreference(
            workspace_id=ws_uuid,
            project_id=project_uuid,
            key=payload.key,
            value_json=payload.value_json,
        )
        db.add(pref)
    db.commit()
    return {"ok": "true"}

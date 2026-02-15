"""add user_preferences

Revision ID: l6i3d4e5f6g
Revises: k5h2c3d4e5f
Create Date: 2026-02-09

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "l6i3d4e5f6g"
down_revision = "k5h2c3d4e5f"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_preferences'"
    ))
    if result.scalar() is not None:
        return  # table already exists (e.g. created outside Alembic or previous partial run)
    op.create_table(
        "user_preferences",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=True),
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("value_json", postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_preferences_workspace_id"), "user_preferences", ["workspace_id"], unique=False)
    op.create_index(op.f("ix_user_preferences_project_id"), "user_preferences", ["project_id"], unique=False)
    op.create_index(op.f("ix_user_preferences_key"), "user_preferences", ["key"], unique=False)
    op.create_index(
        "ix_user_preferences_ws_key_null_project",
        "user_preferences",
        ["workspace_id", "key"],
        unique=True,
        postgresql_where=sa.text("project_id IS NULL"),
    )
    op.create_index(
        "ix_user_preferences_ws_project_key",
        "user_preferences",
        ["workspace_id", "project_id", "key"],
        unique=True,
        postgresql_where=sa.text("project_id IS NOT NULL"),
    )


def downgrade():
    op.drop_index("ix_user_preferences_ws_project_key", table_name="user_preferences")
    op.drop_index("ix_user_preferences_ws_key_null_project", table_name="user_preferences")
    op.drop_index(op.f("ix_user_preferences_key"), table_name="user_preferences")
    op.drop_index(op.f("ix_user_preferences_project_id"), table_name="user_preferences")
    op.drop_index(op.f("ix_user_preferences_workspace_id"), table_name="user_preferences")
    op.drop_table("user_preferences")

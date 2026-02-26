"""add ingest_rules table (V4a)

Revision ID: y8b9c0d1e2f
Revises: x7a8b9c0d1e2
Create Date: 2026-02-23

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "y8b9c0d1e2f"
down_revision: Union[str, Sequence[str], None] = "x7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ingest_rules",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("config_json", postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ingest_rules_project_id"), "ingest_rules", ["project_id"], unique=False)
    op.create_index(op.f("ix_ingest_rules_type"), "ingest_rules", ["type"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_ingest_rules_type"), table_name="ingest_rules")
    op.drop_index(op.f("ix_ingest_rules_project_id"), table_name="ingest_rules")
    op.drop_table("ingest_rules")

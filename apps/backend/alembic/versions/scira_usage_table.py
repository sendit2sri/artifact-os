"""add scira_usage table for query ingest rate limit

Revision ID: scira_usage_01
Revises: a14a688b741f
Create Date: Scira V1 rate limit

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "scira_usage_01"
down_revision: Union[str, Sequence[str], None] = "a14a688b741f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scira_usage",
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("project_id"),
    )


def downgrade() -> None:
    op.drop_table("scira_usage")

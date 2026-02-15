"""add source_type canonical_url metadata_json to source_docs; source_url to research_nodes

Revision ID: m7j4e5f6g7h
Revises: l6i3d4e5f6g
Create Date: 2026-02-09

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "m7j4e5f6g7h"
down_revision = "l6i3d4e5f6g"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "source_docs",
        sa.Column("source_type", sa.String(20), nullable=False, server_default="WEB"),
    )
    op.add_column(
        "source_docs",
        sa.Column("canonical_url", sa.String(2048), nullable=True),
    )
    op.add_column(
        "source_docs",
        sa.Column("metadata_json", postgresql.JSON(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "research_nodes",
        sa.Column("source_url", sa.Text(), nullable=True),
    )


def downgrade():
    op.drop_column("research_nodes", "source_url")
    op.drop_column("source_docs", "metadata_json")
    op.drop_column("source_docs", "canonical_url")
    op.drop_column("source_docs", "source_type")

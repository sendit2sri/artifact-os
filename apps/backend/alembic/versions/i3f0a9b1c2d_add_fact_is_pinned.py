"""add fact is_pinned

Revision ID: i3f0a9b1c2d
Revises: h2e7f8a9b0c1
Create Date: 2026-02-08

"""
from alembic import op
import sqlalchemy as sa

revision = "i3f0a9b1c2d"
down_revision = "h2e7f8a9b0c1"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "research_nodes",
        sa.Column("is_pinned", sa.Boolean(), nullable=True, server_default=sa.text("false")),
    )


def downgrade():
    op.drop_column("research_nodes", "is_pinned")

"""add fact dedup fields

Revision ID: j4g1b2c3d4e
Revises: i3f0a9b1c2d
Create Date: 2026-02-08

"""
from alembic import op
import sqlalchemy as sa

revision = "j4g1b2c3d4e"
down_revision = "i3f0a9b1c2d"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "research_nodes",
        sa.Column("duplicate_group_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "research_nodes",
        sa.Column("is_suppressed", sa.Boolean(), nullable=True, server_default=sa.text("false")),
    )
    op.add_column(
        "research_nodes",
        sa.Column("canonical_fact_id", sa.Uuid(), nullable=True),
    )


def downgrade():
    op.drop_column("research_nodes", "canonical_fact_id")
    op.drop_column("research_nodes", "is_suppressed")
    op.drop_column("research_nodes", "duplicate_group_id")

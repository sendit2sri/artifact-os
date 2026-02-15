"""add output quality_stats

Revision ID: k5h2c3d4e5f
Revises: j4g1b2c3d4e
Create Date: 2026-02-08

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "k5h2c3d4e5f"
down_revision = "j4g1b2c3d4e"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "outputs",
        sa.Column("quality_stats", postgresql.JSON(astext_type=sa.Text()), nullable=True),
    )


def downgrade():
    op.drop_column("outputs", "quality_stats")

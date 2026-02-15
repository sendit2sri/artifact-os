"""add output is_pinned

Revision ID: h2e7f8a9b0c1
Revises: 98ed6dc487dd
Create Date: 2026-02-08

"""
from alembic import op
import sqlalchemy as sa

revision = "h2e7f8a9b0c1"
down_revision = "98ed6dc487dd"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("outputs", sa.Column("is_pinned", sa.Boolean(), nullable=True, server_default=sa.text("false")))


def downgrade():
    op.drop_column("outputs", "is_pinned")

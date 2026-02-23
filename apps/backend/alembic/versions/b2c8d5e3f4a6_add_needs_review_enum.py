"""add_needs_review_enum

Revision ID: b2c8d5e3f4a6
Revises: f1c8d4a2e9b7
Create Date: 2026-02-07 12:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'b2c8d5e3f4a6'
down_revision = 'f1c8d4a2e9b7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add 'needs_review' to ReviewStatus enum in PostgreSQL
    # First, check if the type is enum-based or check constraint
    op.execute("ALTER TYPE reviewstatus ADD VALUE IF NOT EXISTS 'needs_review'")


def downgrade() -> None:
    # PostgreSQL doesn't support removing enum values easily
    # This is a one-way migration for safety
    pass

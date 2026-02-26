"""add MEDIA to sourcetype enum

Revision ID: x7a8b9c0d1e2
Revises: i3f0a9b1c2d
Create Date: 2026-02-23

"""
from typing import Sequence, Union

from alembic import op

revision: str = "x7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "i3f0a9b1c2d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE sourcetype ADD VALUE 'MEDIA'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values; downgrade is no-op.
    pass

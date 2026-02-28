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
    # Safe regardless of migration order: if sourcetype enum was not created yet
    # (other branch), create it with all 4 values; otherwise add MEDIA if missing.
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sourcetype') THEN
                CREATE TYPE sourcetype AS ENUM ('WEB', 'REDDIT', 'YOUTUBE', 'MEDIA');
            ELSIF NOT EXISTS (
                SELECT 1 FROM pg_enum e
                JOIN pg_type t ON e.enumtypid = t.oid
                WHERE t.typname = 'sourcetype' AND e.enumlabel = 'MEDIA'
            ) THEN
                ALTER TYPE sourcetype ADD VALUE 'MEDIA';
            END IF;
        END;
        $$;
    """)


def downgrade() -> None:
    # PostgreSQL does not support removing enum values; downgrade is no-op.
    pass

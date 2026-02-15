"""add reviewstatus enum values

Revision ID: 19a38gb66c46
Revises: 18f27fa55b35
Create Date: 2026-02-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "19a38gb66c46"
down_revision: Union[str, Sequence[str], None] = "18f27fa55b35"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add NEEDS_REVIEW and any other missing reviewstatus values for seed/E2E."""
    for label in ("NEEDS_REVIEW", "REJECTED", "APPROVED"):
        op.execute(f"""
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'reviewstatus' AND e.enumlabel = '{label}'
    ) THEN
        ALTER TYPE reviewstatus ADD VALUE '{label}';
    END IF;
END $$;
""")


def downgrade() -> None:
    # Postgres enum values cannot be removed easily; leave as-is
    pass

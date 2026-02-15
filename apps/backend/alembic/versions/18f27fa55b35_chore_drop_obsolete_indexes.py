"""chore: drop obsolete indexes

Revision ID: 18f27fa55b35
Revises: 27a719a4fabd
Create Date: 2026-02-15 21:02:47.839840

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '18f27fa55b35'
down_revision: Union[str, Sequence[str], None] = '27a719a4fabd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Drop indexes no longer defined in models (if_exists for local dev DBs that may differ)
    op.drop_index("idx_unique_project_url", table_name="source_docs", if_exists=True)
    op.drop_index("ix_user_preferences_ws_key_null_project", table_name="user_preferences", if_exists=True)
    op.drop_index("ix_user_preferences_ws_project_key", table_name="user_preferences", if_exists=True)

    # Add enum values to integritystatus (DO-block for PG version compatibility)
    for label in ("VERIFIED", "NEEDS_REVIEW", "REJECTED"):
        op.execute(f"""
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'integritystatus' AND e.enumlabel = '{label}'
    ) THEN
        ALTER TYPE integritystatus ADD VALUE '{label}';
    END IF;
END $$;
""")


def downgrade() -> None:
    """Downgrade schema."""
    # Postgres enum values cannot be removed easily
    op.create_index(
        "idx_unique_project_url", "source_docs", ["project_id", "url"], unique=True
    )
    op.create_index(
        "ix_user_preferences_ws_key_null_project",
        "user_preferences",
        ["workspace_id", "key"],
        unique=True,
        postgresql_where=sa.text("project_id IS NULL"),
    )
    op.create_index(
        "ix_user_preferences_ws_project_key",
        "user_preferences",
        ["workspace_id", "project_id", "key"],
        unique=True,
        postgresql_where=sa.text("project_id IS NOT NULL"),
    )

"""chore: sync models (research_nodes + source_docs)

Revision ID: 27a719a4fabd
Revises: ee79e9d9f254
Create Date: 2026-02-15 20:57:30.203437

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '27a719a4fabd'
down_revision: Union[str, Sequence[str], None] = 'ee79e9d9f254'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # research_nodes: add section_context, tags, is_key_claim (IF NOT EXISTS for local dev DBs that may have them)
    op.execute("ALTER TABLE research_nodes ADD COLUMN IF NOT EXISTS section_context TEXT")
    op.execute("ALTER TABLE research_nodes ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb")
    op.execute("ALTER TABLE research_nodes ADD COLUMN IF NOT EXISTS is_key_claim BOOLEAN NOT NULL DEFAULT false")

    # research_nodes: make quote_text_raw, quote_hash nullable
    op.alter_column(
        'research_nodes', 'quote_text_raw',
        existing_type=sa.Text(),
        nullable=True,
    )
    op.alter_column(
        'research_nodes', 'quote_hash',
        existing_type=sa.Text(),
        nullable=True,
    )

    # source_docs: make content_s3_path, content_hash nullable (fixes seed NOT NULL violation)
    op.alter_column(
        'source_docs', 'content_s3_path',
        existing_type=sa.Text(),
        nullable=True,
    )
    op.alter_column(
        'source_docs', 'content_hash',
        existing_type=sa.Text(),
        nullable=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    # source_docs: restore NOT NULL (requires backfill first in practice)
    op.alter_column(
        'source_docs', 'content_hash',
        existing_type=sa.Text(),
        nullable=False,
    )
    op.alter_column(
        'source_docs', 'content_s3_path',
        existing_type=sa.Text(),
        nullable=False,
    )

    # research_nodes: restore NOT NULL for quote fields
    op.alter_column(
        'research_nodes', 'quote_hash',
        existing_type=sa.Text(),
        nullable=False,
    )
    op.alter_column(
        'research_nodes', 'quote_text_raw',
        existing_type=sa.Text(),
        nullable=False,
    )

    # research_nodes: drop added columns
    op.drop_column('research_nodes', 'is_key_claim')
    op.drop_column('research_nodes', 'tags')
    op.drop_column('research_nodes', 'section_context')

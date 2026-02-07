"""unique_project_source_url

Revision ID: 024b9f7a1c2d
Revises: 014daa922afc
Create Date: 2026-01-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '024b9f7a1c2d'
down_revision: Union[str, Sequence[str], None] = '014daa922afc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create a unique index on (project_id, url) to prevent duplicate sources per project
    op.create_index('idx_unique_project_url', 'source_docs', ['project_id', 'url'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_unique_project_url', table_name='source_docs')

"""add_content_variants

Revision ID: e67fb8fa9805
Revises: b93e7e3ec5fc
Create Date: 2026-02-06 19:23:37.612268

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e67fb8fa9805'
down_revision: Union[str, Sequence[str], None] = 'b93e7e3ec5fc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add content variant columns to source_docs
    op.add_column('source_docs', sa.Column('content_text_raw', sa.Text(), nullable=True))
    op.add_column('source_docs', sa.Column('content_markdown', sa.Text(), nullable=True))
    op.add_column('source_docs', sa.Column('content_html_clean', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    # Remove content variant columns from source_docs
    op.drop_column('source_docs', 'content_html_clean')
    op.drop_column('source_docs', 'content_markdown')
    op.drop_column('source_docs', 'content_text_raw')

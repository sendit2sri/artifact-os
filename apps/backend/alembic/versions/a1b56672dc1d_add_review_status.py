"""add_review_status

Revision ID: a1b56672dc1d
Revises: c1aeab4f2b9b
Create Date: 2026-01-15 04:31:39.841271

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b56672dc1d'
down_revision: Union[str, Sequence[str], None] = 'c1aeab4f2b9b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create ENUM type
    reviewstatus_enum = sa.Enum('PENDING', 'APPROVED', 'FLAGGED', 'REJECTED', name='reviewstatus', native_enum=True)
    reviewstatus_enum.create(op.get_bind(), checkfirst=True)
    
    # Add column with default
    op.add_column('research_nodes', sa.Column('review_status', reviewstatus_enum, nullable=False, server_default='PENDING'))


def downgrade() -> None:
    """Downgrade schema."""
    # Drop column
    op.drop_column('research_nodes', 'review_status')
    
    # Drop ENUM type
    op.execute("DROP TYPE IF EXISTS reviewstatus")

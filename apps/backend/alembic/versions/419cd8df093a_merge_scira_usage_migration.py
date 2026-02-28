"""merge scira usage migration

Revision ID: 419cd8df093a
Revises: f8451f126aba, scira_usage_01
Create Date: 2026-02-28 16:48:29.127420

"""
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = '419cd8df093a'
down_revision: Union[str, Sequence[str], None] = ('f8451f126aba', 'scira_usage_01')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass

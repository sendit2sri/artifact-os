"""merge_alembic_heads

Revision ID: a14a688b741f
Revises: 50138b67e74e
Create Date: 2026-02-24 00:44:56.480059

"""
from typing import Sequence, Union



# revision identifiers, used by Alembic.
revision: str = 'a14a688b741f'
down_revision: Union[str, Sequence[str], None] = '50138b67e74e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass

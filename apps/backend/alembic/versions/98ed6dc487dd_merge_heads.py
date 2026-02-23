"""merge heads

Revision ID: 98ed6dc487dd
Revises: b2c8d5e3f4a6, g1d5e6f7a8b9
Create Date: 2026-02-08 13:25:07.978828

"""
from typing import Sequence, Union



# revision identifiers, used by Alembic.
revision: str = '98ed6dc487dd'
down_revision: Union[str, Sequence[str], None] = ('b2c8d5e3f4a6', 'g1d5e6f7a8b9')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass

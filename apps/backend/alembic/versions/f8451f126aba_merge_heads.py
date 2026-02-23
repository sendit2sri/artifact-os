"""merge heads

Revision ID: f8451f126aba
Revises: 50138b67e74e, y8b9c0d1e2f
Create Date: 2026-02-24 02:34:16.108555

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f8451f126aba'
down_revision: Union[str, Sequence[str], None] = ('50138b67e74e', 'y8b9c0d1e2f')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass

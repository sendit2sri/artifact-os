"""add evidence_snippet to research_nodes

Revision ID: g1d5e6f7a8b9
Revises: f1c8d4a2e9b7
Create Date: 2026-02-08

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'g1d5e6f7a8b9'
down_revision = 'a3f9b2c1d8e5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('research_nodes', sa.Column('evidence_snippet', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('research_nodes', 'evidence_snippet')

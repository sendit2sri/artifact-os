"""add evidence offsets

Revision ID: a3f9b2c1d8e5
Revises: f1c8d4a2e9b7
Create Date: 2026-02-07 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a3f9b2c1d8e5'
down_revision = 'f1c8d4a2e9b7'
branch_labels = None
depends_on = None


def upgrade():
    # Add evidence offset columns to research_nodes
    op.add_column('research_nodes', sa.Column('evidence_start_char_raw', sa.Integer(), nullable=True))
    op.add_column('research_nodes', sa.Column('evidence_end_char_raw', sa.Integer(), nullable=True))
    op.add_column('research_nodes', sa.Column('evidence_start_char_md', sa.Integer(), nullable=True))
    op.add_column('research_nodes', sa.Column('evidence_end_char_md', sa.Integer(), nullable=True))


def downgrade():
    # Remove evidence offset columns from research_nodes
    op.drop_column('research_nodes', 'evidence_end_char_md')
    op.drop_column('research_nodes', 'evidence_start_char_md')
    op.drop_column('research_nodes', 'evidence_end_char_raw')
    op.drop_column('research_nodes', 'evidence_start_char_raw')

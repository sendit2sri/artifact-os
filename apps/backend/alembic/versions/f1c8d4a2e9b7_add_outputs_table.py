"""add outputs table

Revision ID: f1c8d4a2e9b7
Revises: e67fb8fa9805
Create Date: 2026-02-07 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid

# revision identifiers, used by Alembic.
revision = 'f1c8d4a2e9b7'
down_revision = 'e67fb8fa9805'
branch_labels = None
depends_on = None


def upgrade():
    # Create outputs table
    op.create_table('outputs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, default=uuid.uuid4),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('output_type', sa.String(), nullable=False, server_default='synthesis'),
        sa.Column('mode', sa.String(), nullable=False, server_default='paragraph'),
        sa.Column('fact_ids', postgresql.JSON(), nullable=False, server_default='[]'),
        sa.Column('source_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_outputs_project_id'), 'outputs', ['project_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_outputs_project_id'), table_name='outputs')
    op.drop_table('outputs')

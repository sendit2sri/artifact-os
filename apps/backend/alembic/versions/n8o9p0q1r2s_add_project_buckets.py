"""add project_bucket_sets, project_bucket_items, project_bucket_facts

Revision ID: n8o9p0q1r2s
Revises: 419cd8df093a
Create Date: 2026-03-01

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "n8o9p0q1r2s"
down_revision = "419cd8df093a"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "project_bucket_sets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_project_bucket_sets_project_id"), "project_bucket_sets", ["project_id"], unique=True)

    op.create_table(
        "project_bucket_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("bucket_set_id", sa.Uuid(), nullable=False),
        sa.Column("bucket_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["bucket_set_id"], ["project_bucket_sets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_project_bucket_items_bucket_set_id"), "project_bucket_items", ["bucket_set_id"], unique=False)
    op.create_index(op.f("ix_project_bucket_items_bucket_id"), "project_bucket_items", ["bucket_id"], unique=False)

    op.create_table(
        "project_bucket_facts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("bucket_item_id", sa.Uuid(), nullable=False),
        sa.Column("fact_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["bucket_item_id"], ["project_bucket_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_project_bucket_facts_bucket_item_id"), "project_bucket_facts", ["bucket_item_id"], unique=False)
    op.create_index(op.f("ix_project_bucket_facts_fact_id"), "project_bucket_facts", ["fact_id"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_project_bucket_facts_fact_id"), table_name="project_bucket_facts")
    op.drop_index(op.f("ix_project_bucket_facts_bucket_item_id"), table_name="project_bucket_facts")
    op.drop_table("project_bucket_facts")
    op.drop_index(op.f("ix_project_bucket_items_bucket_id"), table_name="project_bucket_items")
    op.drop_index(op.f("ix_project_bucket_items_bucket_set_id"), table_name="project_bucket_items")
    op.drop_table("project_bucket_items")
    op.drop_index(op.f("ix_project_bucket_sets_project_id"), table_name="project_bucket_sets")
    op.drop_table("project_bucket_sets")

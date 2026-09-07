"""add presentation notes

Revision ID: b7e4f5a6c8d9
Revises: a6c2d3e4f5b7
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "b7e4f5a6c8d9"
down_revision: str | None = "a6c2d3e4f5b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if _has_table("presentation_notes"):
        return
    op.create_table(
        "presentation_notes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("presentation_id", sa.Uuid(), nullable=False),
        sa.Column("slide_id", sa.Uuid(), nullable=False),
        sa.Column("parent_id", sa.Uuid(), nullable=True),
        sa.Column("author_user_id", sa.Uuid(), nullable=True),
        sa.Column("author_username", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("x", sa.Float(), nullable=True),
        sa.Column("y", sa.Float(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["presentation_id"],
            ["presentations.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"],
            ["presentation_notes.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["author_user_id"],
            ["user.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_presentation_notes_presentation_id",
        "presentation_notes",
        ["presentation_id"],
        unique=False,
    )
    op.create_index(
        "ix_presentation_notes_slide_id",
        "presentation_notes",
        ["slide_id"],
        unique=False,
    )
    op.create_index(
        "ix_presentation_notes_parent_id",
        "presentation_notes",
        ["parent_id"],
        unique=False,
    )
    op.create_index(
        "ix_presentation_notes_author_user_id",
        "presentation_notes",
        ["author_user_id"],
        unique=False,
    )


def downgrade() -> None:
    if _has_table("presentation_notes"):
        op.drop_table("presentation_notes")

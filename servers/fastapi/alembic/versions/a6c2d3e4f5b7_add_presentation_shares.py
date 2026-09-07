"""add presentation shares

Revision ID: a6c2d3e4f5b7
Revises: f5b8c1d2e3a4
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "a6c2d3e4f5b7"
down_revision: str | None = "f5b8c1d2e3a4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if _has_table("presentation_shares"):
        return
    op.create_table(
        "presentation_shares",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("presentation_id", sa.Uuid(), nullable=False),
        sa.Column("shared_with_user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["presentation_id"],
            ["presentations.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["shared_with_user_id"],
            ["user.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["user.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "presentation_id",
            "shared_with_user_id",
            name="uq_presentation_share_user",
        ),
    )
    op.create_index(
        "ix_presentation_shares_presentation_id",
        "presentation_shares",
        ["presentation_id"],
        unique=False,
    )
    op.create_index(
        "ix_presentation_shares_shared_with_user_id",
        "presentation_shares",
        ["shared_with_user_id"],
        unique=False,
    )


def downgrade() -> None:
    if _has_table("presentation_shares"):
        op.drop_table("presentation_shares")

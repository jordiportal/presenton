"""add presentation leases and presence

Revision ID: f5b8c1d2e3a4
Revises: e4c7a9b2d6f1
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "f5b8c1d2e3a4"
down_revision: str | None = "e4c7a9b2d6f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not _has_table("presentation_leases"):
        op.create_table(
            "presentation_leases",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("presentation_id", sa.Uuid(), nullable=False),
            sa.Column("scope", sa.String(), nullable=False),
            sa.Column("holder_type", sa.String(), nullable=False),
            sa.Column("holder_id", sa.Uuid(), nullable=True),
            sa.Column("session_id", sa.String(), nullable=False),
            sa.Column("holder_name", sa.String(), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(
                ["presentation_id"],
                ["presentations.id"],
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "presentation_id",
                "scope",
                name="uq_presentation_lease_scope",
            ),
        )
        op.create_index(
            "ix_presentation_leases_presentation_id",
            "presentation_leases",
            ["presentation_id"],
            unique=False,
        )
        op.create_index(
            "ix_presentation_leases_scope",
            "presentation_leases",
            ["scope"],
            unique=False,
        )
        op.create_index(
            "ix_presentation_leases_holder_id",
            "presentation_leases",
            ["holder_id"],
            unique=False,
        )
        op.create_index(
            "ix_presentation_leases_session_id",
            "presentation_leases",
            ["session_id"],
            unique=False,
        )

    if not _has_table("presentation_presence"):
        op.create_table(
            "presentation_presence",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("presentation_id", sa.Uuid(), nullable=False),
            sa.Column("holder_type", sa.String(), nullable=False),
            sa.Column("holder_id", sa.Uuid(), nullable=True),
            sa.Column("session_id", sa.String(), nullable=False),
            sa.Column("holder_name", sa.String(), nullable=False),
            sa.Column("slide_index", sa.Integer(), nullable=True),
            sa.Column("slide_id", sa.Uuid(), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(
                ["presentation_id"],
                ["presentations.id"],
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "presentation_id",
                "session_id",
                name="uq_presentation_presence_session",
            ),
        )
        op.create_index(
            "ix_presentation_presence_presentation_id",
            "presentation_presence",
            ["presentation_id"],
            unique=False,
        )
        op.create_index(
            "ix_presentation_presence_holder_id",
            "presentation_presence",
            ["holder_id"],
            unique=False,
        )
        op.create_index(
            "ix_presentation_presence_session_id",
            "presentation_presence",
            ["session_id"],
            unique=False,
        )


def downgrade() -> None:
    if _has_table("presentation_presence"):
        op.drop_table("presentation_presence")
    if _has_table("presentation_leases"):
        op.drop_table("presentation_leases")

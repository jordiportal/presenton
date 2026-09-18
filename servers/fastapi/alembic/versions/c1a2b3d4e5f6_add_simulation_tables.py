"""add sales-plan simulation tables

Revision ID: c1a2b3d4e5f6
Revises: b7e4f5a6c8d9
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "c1a2b3d4e5f6"
down_revision: str | None = "b7e4f5a6c8d9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _has_table(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if not _has_table("simulation_workbook"):
        op.create_table(
            "simulation_workbook",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("owner_id", sa.Uuid(), nullable=True),
            sa.Column("presentation_id", sa.Uuid(), nullable=True),
            sa.Column("element_name", sa.String(), nullable=True),
            sa.Column("pack", sa.String(), nullable=False),
            sa.Column("spec", sa.JSON(), nullable=True),
            sa.Column("closed_month", sa.String(), nullable=True),
            sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["owner_id"], ["user.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_simulation_workbook_owner_id",
            "simulation_workbook",
            ["owner_id"],
            unique=False,
        )
        op.create_index(
            "ix_simulation_workbook_presentation_id",
            "simulation_workbook",
            ["presentation_id"],
            unique=False,
        )

    if not _has_table("simulation_row"):
        op.create_table(
            "simulation_row",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("workbook_id", sa.Uuid(), nullable=False),
            sa.Column("row_key", sa.String(), nullable=False),
            sa.Column("label", sa.String(), nullable=False),
            sa.Column("ordinal", sa.Integer(), nullable=False),
            sa.Column("source_values", sa.JSON(), nullable=True),
            sa.ForeignKeyConstraint(
                ["workbook_id"], ["simulation_workbook.id"], ondelete="CASCADE"
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_simulation_row_workbook_id",
            "simulation_row",
            ["workbook_id"],
            unique=False,
        )
        op.create_index(
            "ix_simulation_row_row_key", "simulation_row", ["row_key"], unique=False
        )

    if not _has_table("simulation_override"):
        op.create_table(
            "simulation_override",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("workbook_id", sa.Uuid(), nullable=False),
            sa.Column("row_key", sa.String(), nullable=False),
            sa.Column("column_id", sa.String(), nullable=False),
            sa.Column("value", sa.Float(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(
                ["workbook_id"], ["simulation_workbook.id"], ondelete="CASCADE"
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "workbook_id", "row_key", "column_id", name="uq_simulation_override"
            ),
        )
        op.create_index(
            "ix_simulation_override_workbook_id",
            "simulation_override",
            ["workbook_id"],
            unique=False,
        )
        op.create_index(
            "ix_simulation_override_row_key",
            "simulation_override",
            ["row_key"],
            unique=False,
        )


def downgrade() -> None:
    if _has_table("simulation_override"):
        op.drop_table("simulation_override")
    if _has_table("simulation_row"):
        op.drop_table("simulation_row")
    if _has_table("simulation_workbook"):
        op.drop_table("simulation_workbook")

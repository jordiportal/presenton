"""add template to presentations

Revision ID: d4e6f8a0b2c3
Revises: c1a2b3d4e5f6
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "d4e6f8a0b2c3"
down_revision: str | None = "c1a2b3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _has_column(table_name: str, column_name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return False
    return column_name in {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    if not _has_column("presentations", "template"):
        op.add_column("presentations", sa.Column("template", sa.String(), nullable=True))


def downgrade() -> None:
    if _has_column("presentations", "template"):
        op.drop_column("presentations", "template")

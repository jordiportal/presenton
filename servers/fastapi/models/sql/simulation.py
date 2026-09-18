"""SQL models backing the sales-plan simulation workbook.

The workbook lives in the database (not inside ``slides.ui``); the slide only
keeps the rendered snapshot. Three tables mirror the Inforiver model:

* ``simulation_workbook``  — one per table element: source queries, pack spec.
* ``simulation_row``       — the matrix grain plus the fetched ``source`` values.
* ``simulation_override``  — sparse user edits (replaces the SharePoint Excel).
"""

import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import JSON, Column, DateTime, ForeignKey, UniqueConstraint
from sqlmodel import Field, SQLModel

from api.v1.auth.context import get_current_owner_id
from utils.datetime_utils import get_current_utc_datetime


class SimulationWorkbook(SQLModel, table=True):
    __tablename__ = "simulation_workbook"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: Optional[uuid.UUID] = Field(
        default_factory=get_current_owner_id,
        exclude=True,
        sa_column=Column(
            ForeignKey("user.id", ondelete="CASCADE"), nullable=True, index=True
        ),
    )
    presentation_id: Optional[uuid.UUID] = Field(default=None, index=True)
    element_name: Optional[str] = Field(default=None)
    pack: str = Field(default="plan-ventas.v1")
    # Full source spec: queries, measure mapping, row dimensions, year/version.
    spec: dict[str, Any] = Field(sa_column=Column(JSON), default_factory=dict)
    closed_month: Optional[str] = Field(default=None)
    fetched_at: Optional[datetime] = Field(
        sa_column=Column(DateTime(timezone=True), nullable=True), default=None
    )
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False),
        default_factory=get_current_utc_datetime,
    )
    updated_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False),
        default_factory=get_current_utc_datetime,
    )


class SimulationRow(SQLModel, table=True):
    __tablename__ = "simulation_row"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workbook_id: uuid.UUID = Field(
        sa_column=Column(
            ForeignKey("simulation_workbook.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    row_key: str = Field(index=True)
    label: str = Field(default="")
    ordinal: int = Field(default=0)
    # Fetched ``source`` values (uds_ly, uds_ay, vn_ay, incr defaults, month mix…).
    source_values: dict[str, Any] = Field(sa_column=Column(JSON), default_factory=dict)


class SimulationOverride(SQLModel, table=True):
    __tablename__ = "simulation_override"
    __table_args__ = (
        UniqueConstraint(
            "workbook_id", "row_key", "column_id", name="uq_simulation_override"
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workbook_id: uuid.UUID = Field(
        sa_column=Column(
            ForeignKey("simulation_workbook.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    row_key: str = Field(index=True)
    column_id: str = Field()
    value: float = Field()
    updated_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False),
        default_factory=get_current_utc_datetime,
    )

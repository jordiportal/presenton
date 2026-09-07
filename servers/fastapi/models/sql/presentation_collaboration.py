import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint
from sqlmodel import Column, Field, SQLModel

from utils.datetime_utils import get_current_utc_datetime


STRUCTURE_SCOPE = "deck:structure"


def slide_scope(slide_id: uuid.UUID | str) -> str:
    return f"slide:{slide_id}"


class PresentationLease(SQLModel, table=True):
    __tablename__ = "presentation_leases"
    __table_args__ = (
        UniqueConstraint(
            "presentation_id",
            "scope",
            name="uq_presentation_lease_scope",
        ),
    )

    id: uuid.UUID = Field(primary_key=True, default_factory=uuid.uuid4)
    presentation_id: uuid.UUID = Field(
        sa_column=Column(
            ForeignKey("presentations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    scope: str = Field(index=True)
    holder_type: str = Field(default="user")
    holder_id: Optional[uuid.UUID] = Field(default=None, index=True)
    session_id: str = Field(index=True)
    holder_name: str = Field(default="Editor")
    expires_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False),
        default_factory=get_current_utc_datetime,
    )
    updated_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False),
        default_factory=get_current_utc_datetime,
    )


class PresentationPresence(SQLModel, table=True):
    __tablename__ = "presentation_presence"
    __table_args__ = (
        UniqueConstraint(
            "presentation_id",
            "session_id",
            name="uq_presentation_presence_session",
        ),
    )

    id: uuid.UUID = Field(primary_key=True, default_factory=uuid.uuid4)
    presentation_id: uuid.UUID = Field(
        sa_column=Column(
            ForeignKey("presentations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    holder_type: str = Field(default="user")
    holder_id: Optional[uuid.UUID] = Field(default=None, index=True)
    session_id: str = Field(index=True)
    holder_name: str = Field(default="Editor")
    slide_index: Optional[int] = Field(default=None)
    slide_id: Optional[uuid.UUID] = Field(default=None)
    expires_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    updated_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False),
        default_factory=get_current_utc_datetime,
    )

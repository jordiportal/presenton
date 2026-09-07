import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey
from sqlmodel import Column, Field, SQLModel

from utils.datetime_utils import get_current_utc_datetime


class PresentationNote(SQLModel, table=True):
    __tablename__ = "presentation_notes"

    id: uuid.UUID = Field(primary_key=True, default_factory=uuid.uuid4)
    presentation_id: uuid.UUID = Field(
        sa_column=Column(
            ForeignKey("presentations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    slide_id: uuid.UUID = Field(index=True)
    parent_id: Optional[uuid.UUID] = Field(
        sa_column=Column(
            ForeignKey("presentation_notes.id", ondelete="CASCADE"),
            nullable=True,
            index=True,
        ),
        default=None,
    )
    author_user_id: Optional[uuid.UUID] = Field(
        sa_column=Column(
            ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        default=None,
    )
    author_username: str = Field(default="Editor")
    body: str
    x: Optional[float] = Field(default=None)
    y: Optional[float] = Field(default=None)
    resolved_at: Optional[datetime] = Field(
        sa_column=Column(DateTime(timezone=True), nullable=True),
        default=None,
    )
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False),
        default_factory=get_current_utc_datetime,
    )
    updated_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False),
        default_factory=get_current_utc_datetime,
    )

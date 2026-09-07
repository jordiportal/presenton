import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint
from sqlmodel import Column, Field, SQLModel

from utils.datetime_utils import get_current_utc_datetime


class PresentationShare(SQLModel, table=True):
    __tablename__ = "presentation_shares"
    __table_args__ = (
        UniqueConstraint(
            "presentation_id",
            "shared_with_user_id",
            name="uq_presentation_share_user",
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
    shared_with_user_id: uuid.UUID = Field(
        sa_column=Column(
            ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )
    )
    role: str = Field(default="editor")
    created_by: Optional[uuid.UUID] = Field(
        sa_column=Column(
            ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        )
    )
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False),
        default_factory=get_current_utc_datetime,
    )

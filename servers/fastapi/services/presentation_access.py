from __future__ import annotations

import uuid
from typing import Literal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.v1.auth.context import get_current_owner_id
from models.sql.presentation import PresentationModel
from models.sql.presentation_share import PresentationShare
from models.sql.user import User

AccessRole = Literal["owner", "editor", "viewer"]


def _shared_presentation_ids(user_id: uuid.UUID):
    return select(PresentationShare.presentation_id).where(
        PresentationShare.shared_with_user_id == user_id
    )


async def get_access_role(
    sql_session: AsyncSession,
    presentation: PresentationModel,
    user_id: uuid.UUID | None = None,
) -> AccessRole | None:
    current = user_id or get_current_owner_id()
    if current is None:
        return "owner"
    if presentation.owner_id == current:
        return "owner"
    share = (
        await sql_session.execute(
            select(PresentationShare).where(
                PresentationShare.presentation_id == presentation.id,
                PresentationShare.shared_with_user_id == current,
            )
        )
    ).scalar_one_or_none()
    if share is None:
        return None
    return "viewer" if share.role == "viewer" else "editor"


async def require_presentation_access(
    sql_session: AsyncSession,
    presentation: PresentationModel,
    *,
    write: bool = False,
    manage: bool = False,
) -> AccessRole:
    role = await get_access_role(sql_session, presentation)
    if role is None:
        raise HTTPException(status_code=404, detail="Presentation not found")
    if manage and role != "owner":
        raise HTTPException(
            status_code=403,
            detail="Only the owner can manage sharing",
        )
    if write and role == "viewer":
        raise HTTPException(
            status_code=403,
            detail="This presentation is shared with you as view-only",
        )
    return role


async def access_roles_by_presentation(
    sql_session: AsyncSession,
    presentations: list[PresentationModel],
) -> dict[uuid.UUID, AccessRole]:
    current = get_current_owner_id()
    roles: dict[uuid.UUID, AccessRole] = {}
    if current is None:
        return {item.id: "owner" for item in presentations}
    missing: list[uuid.UUID] = []
    for item in presentations:
        if item.owner_id == current:
            roles[item.id] = "owner"
        else:
            missing.append(item.id)
    if missing:
        rows = list(
            (
                await sql_session.execute(
                    select(PresentationShare).where(
                        PresentationShare.shared_with_user_id == current,
                        PresentationShare.presentation_id.in_(missing),
                    )
                )
            ).scalars()
        )
        for row in rows:
            roles[row.presentation_id] = (
                "viewer" if row.role == "viewer" else "editor"
            )
    return roles


async def owner_usernames_by_id(
    sql_session: AsyncSession,
    owner_ids: set[uuid.UUID],
) -> dict[uuid.UUID, str]:
    if not owner_ids:
        return {}
    rows = (
        await sql_session.execute(
            select(User.id, User.username).where(User.id.in_(owner_ids))
        )
    ).all()
    return {row.id: row.username for row in rows}


async def list_shared_asset_owner_ids(
    sql_session: AsyncSession,
    user_id: uuid.UUID,
) -> set[uuid.UUID]:
    rows = (
        await sql_session.execute(
            select(PresentationModel.owner_id)
            .join(
                PresentationShare,
                PresentationShare.presentation_id == PresentationModel.id,
            )
            .where(PresentationShare.shared_with_user_id == user_id)
            .execution_options(skip_owner_scope=True)
        )
    ).all()
    return {row[0] for row in rows if row[0]}

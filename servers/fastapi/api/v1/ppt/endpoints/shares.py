import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.v1.auth.principal import principal_from_request
from models.sql.presentation import PresentationModel
from models.sql.presentation_share import PresentationShare
from models.sql.user import User
from services.database import get_async_session
from services.presentation_access import require_presentation_access
from utils.datetime_utils import get_current_utc_datetime

SHARES_ROUTER = APIRouter(prefix="/presentation", tags=["Sharing"])
USERS_ROUTER = APIRouter(prefix="/users", tags=["Sharing"])


class ShareCreateRequest(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    role: Literal["viewer", "editor"] = "editor"


class ShareUpdateRequest(BaseModel):
    role: Literal["viewer", "editor"]


class ShareResponse(BaseModel):
    id: uuid.UUID
    username: str
    role: str
    created_at: str


class UserSearchResponse(BaseModel):
    id: uuid.UUID
    username: str


async def _require_owned_presentation(
    presentation_id: uuid.UUID,
    sql_session: AsyncSession,
    *,
    manage: bool = True,
) -> PresentationModel:
    presentation = await sql_session.get(PresentationModel, presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")
    await require_presentation_access(
        sql_session, presentation, manage=manage
    )
    return presentation


def _serialize_share(share: PresentationShare, username: str) -> ShareResponse:
    return ShareResponse(
        id=share.id,
        username=username,
        role=share.role,
        created_at=share.created_at.isoformat(),
    )


@SHARES_ROUTER.get("/{presentation_id}/shares", response_model=list[ShareResponse])
async def list_presentation_shares(
    presentation_id: uuid.UUID,
    sql_session: AsyncSession = Depends(get_async_session),
):
    await _require_owned_presentation(presentation_id, sql_session)
    rows = list(
        (
            await sql_session.execute(
                select(PresentationShare, User.username)
                .join(User, User.id == PresentationShare.shared_with_user_id)
                .where(PresentationShare.presentation_id == presentation_id)
                .order_by(User.username)
            )
        ).all()
    )
    return [_serialize_share(share, username) for share, username in rows]


@SHARES_ROUTER.post("/{presentation_id}/shares", response_model=ShareResponse)
async def create_presentation_share(
    presentation_id: uuid.UUID,
    payload: ShareCreateRequest,
    request: Request,
    sql_session: AsyncSession = Depends(get_async_session),
):
    presentation = await _require_owned_presentation(presentation_id, sql_session)
    principal = principal_from_request(request)
    username = payload.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")
    if username.lower() == principal.username.lower():
        raise HTTPException(status_code=400, detail="You already own this presentation")

    user = (
        await sql_session.execute(
            select(User).where(User.username.ilike(username))
        )
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if presentation.owner_id == user.id:
        raise HTTPException(status_code=400, detail="You already own this presentation")

    existing = (
        await sql_session.execute(
            select(PresentationShare).where(
                PresentationShare.presentation_id == presentation_id,
                PresentationShare.shared_with_user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        existing.role = payload.role
        sql_session.add(existing)
        await sql_session.commit()
        await sql_session.refresh(existing)
        return _serialize_share(existing, user.username)

    share = PresentationShare(
        presentation_id=presentation_id,
        shared_with_user_id=user.id,
        role=payload.role,
        created_by=principal.user_id,
        created_at=get_current_utc_datetime(),
    )
    sql_session.add(share)
    await sql_session.commit()
    await sql_session.refresh(share)
    return _serialize_share(share, user.username)


@SHARES_ROUTER.patch(
    "/{presentation_id}/shares/{share_id}",
    response_model=ShareResponse,
)
async def update_presentation_share(
    presentation_id: uuid.UUID,
    share_id: uuid.UUID,
    payload: ShareUpdateRequest,
    sql_session: AsyncSession = Depends(get_async_session),
):
    await _require_owned_presentation(presentation_id, sql_session)
    share = await sql_session.get(PresentationShare, share_id)
    if not share or share.presentation_id != presentation_id:
        raise HTTPException(status_code=404, detail="Share not found")
    share.role = payload.role
    sql_session.add(share)
    await sql_session.commit()
    await sql_session.refresh(share)
    username = (
        await sql_session.execute(
            select(User.username).where(User.id == share.shared_with_user_id)
        )
    ).scalar_one()
    return _serialize_share(share, username)


@SHARES_ROUTER.delete("/{presentation_id}/shares/{share_id}", status_code=204)
async def delete_presentation_share(
    presentation_id: uuid.UUID,
    share_id: uuid.UUID,
    sql_session: AsyncSession = Depends(get_async_session),
):
    await _require_owned_presentation(presentation_id, sql_session)
    share = await sql_session.get(PresentationShare, share_id)
    if not share or share.presentation_id != presentation_id:
        raise HTTPException(status_code=404, detail="Share not found")
    await sql_session.delete(share)
    await sql_session.commit()


@USERS_ROUTER.get("/search", response_model=list[UserSearchResponse])
async def search_users(
    request: Request,
    q: str = Query(min_length=1, max_length=128),
    sql_session: AsyncSession = Depends(get_async_session),
):
    principal = principal_from_request(request)
    query = q.strip()
    if not query:
        return []
    rows = list(
        (
            await sql_session.execute(
                select(User)
                .where(
                    User.is_active.is_(True),
                    User.id != principal.user_id,
                    or_(
                        User.username.ilike(f"{query}%"),
                        User.username.ilike(f"%{query}%"),
                    ),
                )
                .order_by(User.username)
                .limit(8)
            )
        ).scalars()
    )
    return [UserSearchResponse(id=user.id, username=user.username) for user in rows]

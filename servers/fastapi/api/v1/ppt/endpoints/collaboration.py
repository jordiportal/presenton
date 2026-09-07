import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from api.v1.auth.principal import AuthPrincipal, principal_from_request
from utils.get_env import is_disable_auth_enabled

_LOCAL_PRINCIPAL = AuthPrincipal(
    user_id=uuid.UUID(int=0),
    username="local",
    is_admin=True,
    method="jwt",
)


def _collaboration_principal(request: Request) -> AuthPrincipal:
    try:
        return principal_from_request(request)
    except HTTPException:
        if is_disable_auth_enabled():
            return _LOCAL_PRINCIPAL
        raise
from models.sql.presentation import PresentationModel
from models.sql.presentation_collaboration import STRUCTURE_SCOPE, slide_scope
from services.collaboration import (
    acquire_lease,
    heartbeat_lease,
    read_session_id,
    release_lease,
    snapshot,
    upsert_presence,
)
from services.database import get_async_session
from services.presentation_access import require_presentation_access

COLLABORATION_ROUTER = APIRouter(prefix="/presentation", tags=["Collaboration"])


class LeaseRequest(BaseModel):
    scope: Literal["deck:structure"] | str
    holder_type: Literal["user", "agent"] = "user"


class PresenceRequest(BaseModel):
    slide_index: int | None = None
    slide_id: uuid.UUID | None = None
    holder_type: Literal["user", "agent"] = "user"


class SyncRequest(BaseModel):
    slide_index: int | None = None
    slide_id: uuid.UUID | None = None
    acquire_slide: bool = True
    acquire_structure: bool = False
    holder_type: Literal["user", "agent"] = "user"
    release_scopes: list[str] = Field(default_factory=list)


async def _require_presentation(
    presentation_id: uuid.UUID,
    sql_session: AsyncSession,
    *,
    write: bool = False,
) -> PresentationModel:
    presentation = await sql_session.get(PresentationModel, presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")
    await require_presentation_access(sql_session, presentation, write=write)
    return presentation


def _require_session(request: Request) -> str:
    session_id = read_session_id(request)
    if not session_id:
        raise HTTPException(
            status_code=400,
            detail="Missing X-Presenton-Session header",
        )
    return session_id


@COLLABORATION_ROUTER.get("/{presentation_id}/collaboration")
async def get_collaboration_snapshot(
    presentation_id: uuid.UUID,
    request: Request,
    sql_session: AsyncSession = Depends(get_async_session),
):
    await _require_presentation(presentation_id, sql_session)
    return await snapshot(sql_session, presentation_id, read_session_id(request))


@COLLABORATION_ROUTER.post("/{presentation_id}/collaboration/sync")
async def sync_collaboration(
    presentation_id: uuid.UUID,
    payload: SyncRequest,
    request: Request,
    sql_session: AsyncSession = Depends(get_async_session),
):
    presentation = await _require_presentation(presentation_id, sql_session)
    session_id = _require_session(request)
    principal = _collaboration_principal(request)

    for scope in payload.release_scopes:
        await release_lease(
            sql_session,
            presentation_id=presentation_id,
            scope=scope,
            session_id=session_id,
        )

    conflicts: list[object] = []

    async def _try_acquire(scope: str) -> None:
        try:
            await acquire_lease(
                sql_session,
                presentation_id=presentation_id,
                scope=scope,
                session_id=session_id,
                principal=principal,
                holder_type=payload.holder_type,
            )
        except HTTPException as exc:
            if exc.status_code != 409:
                raise
            conflicts.append(exc.detail)

    if payload.acquire_structure or (
        payload.acquire_slide and payload.slide_id is not None
    ):
        await require_presentation_access(sql_session, presentation, write=True)

    if payload.acquire_structure:
        await _try_acquire(STRUCTURE_SCOPE)

    if payload.acquire_slide and payload.slide_id is not None:
        await _try_acquire(slide_scope(payload.slide_id))

    await upsert_presence(
        sql_session,
        presentation_id=presentation_id,
        session_id=session_id,
        principal=principal,
        slide_index=payload.slide_index,
        slide_id=payload.slide_id,
        holder_type=payload.holder_type,
    )
    result = await snapshot(sql_session, presentation_id, session_id)
    if conflicts:
        result["conflicts"] = conflicts
    return result


@COLLABORATION_ROUTER.post("/{presentation_id}/collaboration/leases")
async def create_collaboration_lease(
    presentation_id: uuid.UUID,
    payload: LeaseRequest,
    request: Request,
    sql_session: AsyncSession = Depends(get_async_session),
):
    await _require_presentation(presentation_id, sql_session, write=True)
    session_id = _require_session(request)
    principal = _collaboration_principal(request)
    lease = await acquire_lease(
        sql_session,
        presentation_id=presentation_id,
        scope=payload.scope,
        session_id=session_id,
        principal=principal,
        holder_type=payload.holder_type,
    )
    return await snapshot(sql_session, presentation_id, session_id) | {
        "acquired": lease.scope,
    }


@COLLABORATION_ROUTER.post("/{presentation_id}/collaboration/leases/heartbeat")
async def heartbeat_collaboration_lease(
    presentation_id: uuid.UUID,
    payload: LeaseRequest,
    request: Request,
    sql_session: AsyncSession = Depends(get_async_session),
):
    await _require_presentation(presentation_id, sql_session)
    session_id = _require_session(request)
    await heartbeat_lease(
        sql_session,
        presentation_id=presentation_id,
        scope=payload.scope,
        session_id=session_id,
    )
    return await snapshot(sql_session, presentation_id, session_id)


@COLLABORATION_ROUTER.delete("/{presentation_id}/collaboration/leases")
async def delete_collaboration_lease(
    presentation_id: uuid.UUID,
    payload: LeaseRequest,
    request: Request,
    sql_session: AsyncSession = Depends(get_async_session),
):
    await _require_presentation(presentation_id, sql_session)
    session_id = _require_session(request)
    await release_lease(
        sql_session,
        presentation_id=presentation_id,
        scope=payload.scope,
        session_id=session_id,
    )
    return await snapshot(sql_session, presentation_id, session_id)


@COLLABORATION_ROUTER.post("/{presentation_id}/collaboration/presence")
async def update_collaboration_presence(
    presentation_id: uuid.UUID,
    payload: PresenceRequest,
    request: Request,
    sql_session: AsyncSession = Depends(get_async_session),
):
    await _require_presentation(presentation_id, sql_session)
    session_id = _require_session(request)
    principal = _collaboration_principal(request)
    await upsert_presence(
        sql_session,
        presentation_id=presentation_id,
        session_id=session_id,
        principal=principal,
        slide_index=payload.slide_index,
        slide_id=payload.slide_id,
        holder_type=payload.holder_type,
    )
    return await snapshot(sql_session, presentation_id, session_id)

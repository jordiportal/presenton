from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.v1.auth.principal import AuthPrincipal
from models.sql.presentation_collaboration import (
    STRUCTURE_SCOPE,
    PresentationLease,
    PresentationPresence,
    slide_scope,
)
from utils.datetime_utils import get_current_utc_datetime

LEASE_TTL_SECONDS = 45
PRESENCE_TTL_SECONDS = 45
SESSION_HEADER = "x-presenton-session"


def read_session_id(request: Request | None) -> str | None:
    if request is None:
        return None
    raw = (request.headers.get(SESSION_HEADER) or "").strip()
    return raw or None


def is_same_holder(lease: PresentationLease, session_id: str) -> bool:
    return lease.session_id == session_id


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def lease_is_active(lease: PresentationLease, now: datetime) -> bool:
    return _as_utc(lease.expires_at) > _as_utc(now)


def _serialize_lease(lease: PresentationLease, session_id: str | None) -> dict[str, Any]:
    return {
        "id": str(lease.id),
        "scope": lease.scope,
        "holder_type": lease.holder_type,
        "holder_id": str(lease.holder_id) if lease.holder_id else None,
        "holder_name": lease.holder_name,
        "session_id": lease.session_id,
        "mine": bool(session_id and lease.session_id == session_id),
        "expires_at": lease.expires_at.isoformat(),
    }


def _serialize_presence(
    row: PresentationPresence, session_id: str | None
) -> dict[str, Any]:
    return {
        "holder_type": row.holder_type,
        "holder_id": str(row.holder_id) if row.holder_id else None,
        "holder_name": row.holder_name,
        "session_id": row.session_id,
        "slide_index": row.slide_index,
        "slide_id": str(row.slide_id) if row.slide_id else None,
        "mine": bool(session_id and row.session_id == session_id),
        "expires_at": row.expires_at.isoformat(),
    }


async def expire_stale(sql_session: AsyncSession, now: datetime | None = None) -> None:
    moment = _as_utc(now or get_current_utc_datetime())
    leases = list((await sql_session.execute(select(PresentationLease))).scalars())
    for lease in leases:
        if _as_utc(lease.expires_at) <= moment:
            await sql_session.delete(lease)
    presence = list((await sql_session.execute(select(PresentationPresence))).scalars())
    for row in presence:
        if _as_utc(row.expires_at) <= moment:
            await sql_session.delete(row)


async def get_lease(
    sql_session: AsyncSession,
    presentation_id: uuid.UUID,
    scope: str,
) -> PresentationLease | None:
    return (
        await sql_session.execute(
            select(PresentationLease).where(
                PresentationLease.presentation_id == presentation_id,
                PresentationLease.scope == scope,
            )
        )
    ).scalar_one_or_none()


async def acquire_lease(
    sql_session: AsyncSession,
    *,
    presentation_id: uuid.UUID,
    scope: str,
    session_id: str,
    principal: AuthPrincipal,
    holder_type: str = "user",
) -> PresentationLease:
    now = get_current_utc_datetime()
    await expire_stale(sql_session, now)
    existing = await get_lease(sql_session, presentation_id, scope)
    expires = now + timedelta(seconds=LEASE_TTL_SECONDS)

    if existing and lease_is_active(existing, now) and not is_same_holder(existing, session_id):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "lease_held",
                "scope": scope,
                "holder_name": existing.holder_name,
                "message": f"{existing.holder_name} is editing this scope.",
            },
        )

    if existing:
        existing.holder_type = holder_type
        existing.holder_id = principal.user_id
        existing.session_id = session_id
        existing.holder_name = principal.username
        existing.expires_at = expires
        existing.updated_at = now
        sql_session.add(existing)
        await sql_session.commit()
        await sql_session.refresh(existing)
        return existing

    lease = PresentationLease(
        presentation_id=presentation_id,
        scope=scope,
        holder_type=holder_type,
        holder_id=principal.user_id,
        session_id=session_id,
        holder_name=principal.username,
        expires_at=expires,
        created_at=now,
        updated_at=now,
    )
    sql_session.add(lease)
    await sql_session.commit()
    await sql_session.refresh(lease)
    return lease


async def heartbeat_lease(
    sql_session: AsyncSession,
    *,
    presentation_id: uuid.UUID,
    scope: str,
    session_id: str,
) -> PresentationLease | None:
    now = get_current_utc_datetime()
    await expire_stale(sql_session, now)
    existing = await get_lease(sql_session, presentation_id, scope)
    if not existing or not is_same_holder(existing, session_id):
        return None
    existing.expires_at = now + timedelta(seconds=LEASE_TTL_SECONDS)
    existing.updated_at = now
    sql_session.add(existing)
    await sql_session.commit()
    await sql_session.refresh(existing)
    return existing


async def release_lease(
    sql_session: AsyncSession,
    *,
    presentation_id: uuid.UUID,
    scope: str,
    session_id: str,
) -> bool:
    existing = await get_lease(sql_session, presentation_id, scope)
    if not existing or not is_same_holder(existing, session_id):
        return False
    await sql_session.delete(existing)
    await sql_session.commit()
    return True


async def upsert_presence(
    sql_session: AsyncSession,
    *,
    presentation_id: uuid.UUID,
    session_id: str,
    principal: AuthPrincipal,
    slide_index: int | None,
    slide_id: uuid.UUID | None,
    holder_type: str = "user",
) -> PresentationPresence:
    now = get_current_utc_datetime()
    await expire_stale(sql_session, now)
    row = (
        await sql_session.execute(
            select(PresentationPresence).where(
                PresentationPresence.presentation_id == presentation_id,
                PresentationPresence.session_id == session_id,
            )
        )
    ).scalar_one_or_none()
    expires = now + timedelta(seconds=PRESENCE_TTL_SECONDS)
    if row:
        row.holder_type = holder_type
        row.holder_id = principal.user_id
        row.holder_name = principal.username
        row.slide_index = slide_index
        row.slide_id = slide_id
        row.expires_at = expires
        row.updated_at = now
        sql_session.add(row)
        await sql_session.commit()
        await sql_session.refresh(row)
        return row

    row = PresentationPresence(
        presentation_id=presentation_id,
        holder_type=holder_type,
        holder_id=principal.user_id,
        session_id=session_id,
        holder_name=principal.username,
        slide_index=slide_index,
        slide_id=slide_id,
        expires_at=expires,
        updated_at=now,
    )
    sql_session.add(row)
    await sql_session.commit()
    await sql_session.refresh(row)
    return row


async def snapshot(
    sql_session: AsyncSession,
    presentation_id: uuid.UUID,
    session_id: str | None,
) -> dict[str, Any]:
    now = get_current_utc_datetime()
    await expire_stale(sql_session, now)
    leases = list(
        (
            await sql_session.execute(
                select(PresentationLease).where(
                    PresentationLease.presentation_id == presentation_id
                )
            )
        ).scalars()
    )
    presence = list(
        (
            await sql_session.execute(
                select(PresentationPresence).where(
                    PresentationPresence.presentation_id == presentation_id
                )
            )
        ).scalars()
    )
    return {
        "leases": [_serialize_lease(item, session_id) for item in leases],
        "presence": [_serialize_presence(item, session_id) for item in presence],
    }


async def foreign_slide_lease(
    sql_session: AsyncSession,
    presentation_id: uuid.UUID,
    slide_id: uuid.UUID,
    session_id: str,
) -> PresentationLease | None:
    now = get_current_utc_datetime()
    await expire_stale(sql_session, now)
    existing = await get_lease(sql_session, presentation_id, slide_scope(slide_id))
    if existing and lease_is_active(existing, now) and not is_same_holder(existing, session_id):
        return existing
    return None


async def enforce_slide_write(
    request: Request | None,
    sql_session: AsyncSession,
    presentation_id: uuid.UUID,
    slide_id: uuid.UUID,
) -> None:
    session_id = read_session_id(request)
    if not session_id:
        return
    held = await foreign_slide_lease(
        sql_session, presentation_id, slide_id, session_id
    )
    if held:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "lease_held",
                "scope": held.scope,
                "holder_name": held.holder_name,
                "message": f"{held.holder_name} is editing this slide.",
            },
        )


async def enforce_structure_write(
    request: Request | None,
    sql_session: AsyncSession,
    presentation_id: uuid.UUID,
) -> None:
    session_id = read_session_id(request)
    if not session_id:
        return
    now = get_current_utc_datetime()
    await expire_stale(sql_session, now)
    existing = await get_lease(sql_session, presentation_id, STRUCTURE_SCOPE)
    if existing and lease_is_active(existing, now) and not is_same_holder(existing, session_id):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "lease_held",
                "scope": STRUCTURE_SCOPE,
                "holder_name": existing.holder_name,
                "message": f"{existing.holder_name} is changing the deck structure.",
            },
        )

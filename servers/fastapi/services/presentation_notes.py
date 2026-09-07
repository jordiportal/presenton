from __future__ import annotations

import uuid
from typing import Iterable

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.sql.presentation_note import PresentationNote
from utils.datetime_utils import get_current_utc_datetime

MAX_NOTE_BODY = 4000


def clamp_pin(value: float | None) -> float | None:
    if value is None:
        return None
    return max(0.0, min(1.0, float(value)))


def normalize_body(body: str) -> str:
    text = (body or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Note cannot be empty")
    if len(text) > MAX_NOTE_BODY:
        raise HTTPException(
            status_code=400,
            detail=f"Note cannot exceed {MAX_NOTE_BODY} characters",
        )
    return text


async def list_notes(
    sql_session: AsyncSession,
    presentation_id: uuid.UUID,
    slide_id: uuid.UUID | None = None,
) -> list[PresentationNote]:
    query = select(PresentationNote).where(
        PresentationNote.presentation_id == presentation_id
    )
    if slide_id is not None:
        query = query.where(PresentationNote.slide_id == slide_id)
    rows = list((await sql_session.execute(query)).scalars().all())
    rows.sort(key=lambda note: note.created_at)
    return rows


async def get_note(
    sql_session: AsyncSession,
    presentation_id: uuid.UUID,
    note_id: uuid.UUID,
) -> PresentationNote:
    note = await sql_session.get(PresentationNote, note_id)
    if note is None or note.presentation_id != presentation_id:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


async def create_note(
    sql_session: AsyncSession,
    *,
    presentation_id: uuid.UUID,
    slide_id: uuid.UUID,
    author_user_id: uuid.UUID | None,
    author_username: str,
    body: str,
    x: float | None = None,
    y: float | None = None,
    parent_id: uuid.UUID | None = None,
) -> PresentationNote:
    text = normalize_body(body)
    parent: PresentationNote | None = None
    if parent_id is not None:
        parent = await get_note(sql_session, presentation_id, parent_id)
        if parent.parent_id is not None:
            raise HTTPException(
                status_code=400,
                detail="Replies cannot be nested more than one level",
            )
        if parent.slide_id != slide_id:
            raise HTTPException(
                status_code=400,
                detail="Reply must belong to the same slide",
            )

    note = PresentationNote(
        presentation_id=presentation_id,
        slide_id=parent.slide_id if parent else slide_id,
        parent_id=parent.id if parent else None,
        author_user_id=author_user_id,
        author_username=author_username or "Editor",
        body=text,
        x=None if parent else clamp_pin(x),
        y=None if parent else clamp_pin(y),
        created_at=get_current_utc_datetime(),
        updated_at=get_current_utc_datetime(),
    )
    sql_session.add(note)
    await sql_session.commit()
    await sql_session.refresh(note)
    return note


async def update_note(
    sql_session: AsyncSession,
    note: PresentationNote,
    *,
    body: str | None = None,
    resolved: bool | None = None,
) -> PresentationNote:
    if body is not None:
        note.body = normalize_body(body)
    if resolved is not None:
        if note.parent_id is not None:
            raise HTTPException(
                status_code=400,
                detail="Only top-level notes can be resolved",
            )
        note.resolved_at = get_current_utc_datetime() if resolved else None
    note.updated_at = get_current_utc_datetime()
    sql_session.add(note)
    await sql_session.commit()
    await sql_session.refresh(note)
    return note


async def delete_note(
    sql_session: AsyncSession,
    note: PresentationNote,
) -> None:
    if note.parent_id is None:
        replies = list(
            (
                await sql_session.execute(
                    select(PresentationNote).where(
                        PresentationNote.parent_id == note.id
                    )
                )
            ).scalars()
        )
        for reply in replies:
            await sql_session.delete(reply)
    await sql_session.delete(note)
    await sql_session.commit()


def nest_notes(
    notes: Iterable[PresentationNote],
) -> list[tuple[PresentationNote, list[PresentationNote]]]:
    items = list(notes)
    children: dict[uuid.UUID, list[PresentationNote]] = {}
    roots: list[PresentationNote] = []
    for note in items:
        if note.parent_id is None:
            roots.append(note)
        else:
            children.setdefault(note.parent_id, []).append(note)
    return [(root, children.get(root.id, [])) for root in roots]

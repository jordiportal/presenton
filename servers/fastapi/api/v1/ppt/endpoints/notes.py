import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from api.v1.auth.principal import AuthPrincipal, principal_from_request
from models.sql.presentation import PresentationModel
from models.sql.presentation_note import PresentationNote
from services.database import get_async_session
from services.presentation_access import require_presentation_access
from services.presentation_notes import (
    create_note,
    delete_note,
    get_note,
    list_notes,
    nest_notes,
    update_note,
)
from utils.get_env import is_disable_auth_enabled

NOTES_ROUTER = APIRouter(prefix="/presentation", tags=["Notes"])

_LOCAL_PRINCIPAL = AuthPrincipal(
    user_id=uuid.UUID(int=0),
    username="local",
    is_admin=True,
    method="jwt",
)


def _notes_principal(request: Request) -> AuthPrincipal:
    try:
        return principal_from_request(request)
    except HTTPException:
        if is_disable_auth_enabled():
            return _LOCAL_PRINCIPAL
        raise


class NoteCreateRequest(BaseModel):
    slide_id: uuid.UUID
    body: str = Field(min_length=1, max_length=4000)
    x: float | None = Field(default=None, ge=0, le=1)
    y: float | None = Field(default=None, ge=0, le=1)
    parent_id: uuid.UUID | None = None


class NoteReplyRequest(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class NoteUpdateRequest(BaseModel):
    body: str | None = Field(default=None, min_length=1, max_length=4000)
    resolved: bool | None = None


class NoteResponse(BaseModel):
    id: uuid.UUID
    presentation_id: uuid.UUID
    slide_id: uuid.UUID
    parent_id: uuid.UUID | None
    author_user_id: uuid.UUID | None
    author_username: str
    body: str
    x: float | None
    y: float | None
    resolved: bool
    created_at: str
    updated_at: str
    mine: bool
    can_delete: bool
    replies: list["NoteResponse"] = Field(default_factory=list)


async def _require_presentation(
    presentation_id: uuid.UUID,
    sql_session: AsyncSession,
    *,
    write: bool = False,
) -> tuple[PresentationModel, Literal["owner", "editor", "viewer"]]:
    presentation = await sql_session.get(PresentationModel, presentation_id)
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")
    role = await require_presentation_access(
        sql_session, presentation, write=write
    )
    return presentation, role


def _serialize_note(
    note: PresentationNote,
    *,
    user_id: uuid.UUID | None,
    role: str,
    replies: list[PresentationNote] | None = None,
) -> NoteResponse:
    mine = note.author_user_id is not None and note.author_user_id == user_id
    return NoteResponse(
        id=note.id,
        presentation_id=note.presentation_id,
        slide_id=note.slide_id,
        parent_id=note.parent_id,
        author_user_id=note.author_user_id,
        author_username=note.author_username,
        body=note.body,
        x=note.x,
        y=note.y,
        resolved=note.resolved_at is not None,
        created_at=note.created_at.isoformat(),
        updated_at=note.updated_at.isoformat(),
        mine=mine,
        can_delete=mine or role == "owner",
        replies=[
            _serialize_note(reply, user_id=user_id, role=role)
            for reply in (replies or getattr(note, "replies", []) or [])
        ],
    )


@NOTES_ROUTER.get("/{presentation_id}/notes", response_model=list[NoteResponse])
async def list_presentation_notes(
    presentation_id: uuid.UUID,
    request: Request,
    slide_id: uuid.UUID | None = Query(default=None),
    sql_session: AsyncSession = Depends(get_async_session),
):
    _, role = await _require_presentation(presentation_id, sql_session)
    principal = _notes_principal(request)
    notes = nest_notes(
        await list_notes(sql_session, presentation_id, slide_id=slide_id)
    )
    return [
        _serialize_note(note, user_id=principal.user_id, role=role, replies=replies)
        for note, replies in notes
    ]


@NOTES_ROUTER.post(
    "/{presentation_id}/notes",
    response_model=NoteResponse,
    status_code=201,
)
async def create_presentation_note(
    presentation_id: uuid.UUID,
    payload: NoteCreateRequest,
    request: Request,
    sql_session: AsyncSession = Depends(get_async_session),
):
    _, role = await _require_presentation(
        presentation_id, sql_session, write=True
    )
    principal = _notes_principal(request)
    note = await create_note(
        sql_session,
        presentation_id=presentation_id,
        slide_id=payload.slide_id,
        author_user_id=principal.user_id,
        author_username=principal.username,
        body=payload.body,
        x=payload.x,
        y=payload.y,
        parent_id=payload.parent_id,
    )
    return _serialize_note(note, user_id=principal.user_id, role=role)


@NOTES_ROUTER.post(
    "/{presentation_id}/notes/{note_id}/replies",
    response_model=NoteResponse,
    status_code=201,
)
async def reply_to_presentation_note(
    presentation_id: uuid.UUID,
    note_id: uuid.UUID,
    payload: NoteReplyRequest,
    request: Request,
    sql_session: AsyncSession = Depends(get_async_session),
):
    _, role = await _require_presentation(
        presentation_id, sql_session, write=True
    )
    principal = _notes_principal(request)
    parent = await get_note(sql_session, presentation_id, note_id)
    note = await create_note(
        sql_session,
        presentation_id=presentation_id,
        slide_id=parent.slide_id,
        author_user_id=principal.user_id,
        author_username=principal.username,
        body=payload.body,
        parent_id=parent.id,
    )
    return _serialize_note(note, user_id=principal.user_id, role=role)


@NOTES_ROUTER.patch(
    "/{presentation_id}/notes/{note_id}",
    response_model=NoteResponse,
)
async def update_presentation_note(
    presentation_id: uuid.UUID,
    note_id: uuid.UUID,
    payload: NoteUpdateRequest,
    request: Request,
    sql_session: AsyncSession = Depends(get_async_session),
):
    if payload.body is None and payload.resolved is None:
        raise HTTPException(status_code=400, detail="Nothing to update")
    _, role = await _require_presentation(
        presentation_id,
        sql_session,
        write=True,
    )
    principal = _notes_principal(request)
    note = await get_note(sql_session, presentation_id, note_id)
    if payload.body is not None and note.author_user_id != principal.user_id:
        raise HTTPException(
            status_code=403,
            detail="Only the author can edit this note",
        )
    note = await update_note(
        sql_session,
        note,
        body=payload.body,
        resolved=payload.resolved,
    )
    return _serialize_note(note, user_id=principal.user_id, role=role)


@NOTES_ROUTER.delete(
    "/{presentation_id}/notes/{note_id}",
    status_code=204,
)
async def delete_presentation_note(
    presentation_id: uuid.UUID,
    note_id: uuid.UUID,
    request: Request,
    sql_session: AsyncSession = Depends(get_async_session),
):
    presentation, role = await _require_presentation(
        presentation_id, sql_session
    )
    principal = _notes_principal(request)
    note = await get_note(sql_session, presentation_id, note_id)
    is_author = note.author_user_id == principal.user_id
    is_owner = role == "owner" or presentation.owner_id == principal.user_id
    if not is_author and not is_owner:
        raise HTTPException(
            status_code=403,
            detail="Only the author or owner can delete this note",
        )
    await delete_note(sql_session, note)

import asyncio
import uuid

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from api.v1.auth.context import reset_current_owner_id, set_current_owner_id
from models.sql.presentation import PresentationModel, PresentationVersion
from models.sql.presentation_note import PresentationNote
from models.sql.presentation_share import PresentationShare
from models.sql.user import User
from services import database as _database_events  # noqa: F401
from services.presentation_access import require_presentation_access
from services.presentation_notes import (
    create_note,
    delete_note,
    list_notes,
    nest_notes,
    update_note,
)
from fastapi import HTTPException


def test_notes_are_readable_by_viewers_and_writable_by_editors():
    async def run():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        session_maker = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as connection:
            await connection.run_sync(User.__table__.create)
            await connection.run_sync(PresentationModel.__table__.create)
            await connection.run_sync(PresentationShare.__table__.create)
            await connection.run_sync(PresentationNote.__table__.create)

        owner_id, editor_id, viewer_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        presentation_id = uuid.uuid4()
        slide_id = uuid.uuid4()
        async with session_maker() as session:
            session.add_all(
                [
                    User(
                        id=owner_id,
                        username="owner",
                        hashed_password="unused",
                        is_active=True,
                        is_superuser=False,
                        is_verified=True,
                    ),
                    User(
                        id=editor_id,
                        username="editor",
                        hashed_password="unused",
                        is_active=True,
                        is_superuser=False,
                        is_verified=True,
                    ),
                    User(
                        id=viewer_id,
                        username="viewer",
                        hashed_password="unused",
                        is_active=True,
                        is_superuser=False,
                        is_verified=True,
                    ),
                    PresentationModel(
                        id=presentation_id,
                        owner_id=owner_id,
                        version=PresentationVersion.V2_STANDARD,
                        content="noted-deck",
                        n_slides=1,
                        language="English",
                    ),
                    PresentationShare(
                        presentation_id=presentation_id,
                        shared_with_user_id=editor_id,
                        role="editor",
                        created_by=owner_id,
                    ),
                    PresentationShare(
                        presentation_id=presentation_id,
                        shared_with_user_id=viewer_id,
                        role="viewer",
                        created_by=owner_id,
                    ),
                ]
            )
            await session.commit()

        editor_token = set_current_owner_id(editor_id)
        try:
            async with session_maker() as session:
                presentation = await session.get(PresentationModel, presentation_id)
                await require_presentation_access(session, presentation, write=True)
                root = await create_note(
                    session,
                    presentation_id=presentation_id,
                    slide_id=slide_id,
                    author_user_id=editor_id,
                    author_username="editor",
                    body="Please check the headline",
                    x=0.2,
                    y=0.3,
                )
                reply = await create_note(
                    session,
                    presentation_id=presentation_id,
                    slide_id=slide_id,
                    author_user_id=editor_id,
                    author_username="editor",
                    body="Updated copy in the next pass",
                    parent_id=root.id,
                )
                assert reply.parent_id == root.id
                assert reply.x is None
        finally:
            reset_current_owner_id(editor_token)

        viewer_token = set_current_owner_id(viewer_id)
        try:
            async with session_maker() as session:
                presentation = await session.get(PresentationModel, presentation_id)
                await require_presentation_access(session, presentation)
                try:
                    await require_presentation_access(
                        session, presentation, write=True
                    )
                    raise AssertionError("viewer should not write notes")
                except HTTPException as exc:
                    assert exc.status_code == 403
                notes = nest_notes(await list_notes(session, presentation_id))
                assert len(notes) == 1
                root, replies = notes[0]
                assert root.body == "Please check the headline"
                assert len(replies) == 1
        finally:
            reset_current_owner_id(viewer_token)

        owner_token = set_current_owner_id(owner_id)
        try:
            async with session_maker() as session:
                notes = await list_notes(session, presentation_id)
                root = next(note for note in notes if note.parent_id is None)
                updated = await update_note(session, root, resolved=True)
                assert updated.resolved_at is not None
                await delete_note(session, root)
                leftover = await list_notes(session, presentation_id)
                assert leftover == []
        finally:
            reset_current_owner_id(owner_token)

        await engine.dispose()

    asyncio.run(run())

import asyncio
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from api.v1.auth.context import reset_current_owner_id, set_current_owner_id
from models.sql.presentation import PresentationModel, PresentationVersion
from models.sql.presentation_share import PresentationShare
from models.sql.user import User
from services import database as _database_events  # noqa: F401
from services.presentation_access import get_access_role, require_presentation_access
from fastapi import HTTPException


def test_shared_presentation_is_visible_and_viewers_cannot_write():
    async def run():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        session_maker = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as connection:
            await connection.run_sync(User.__table__.create)
            await connection.run_sync(PresentationModel.__table__.create)
            await connection.run_sync(PresentationShare.__table__.create)

        owner_id, editor_id, viewer_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        presentation_id = uuid.uuid4()
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
                        content="shared-deck",
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
                presentations = list(
                    (await session.scalars(select(PresentationModel))).all()
                )
                assert [item.content for item in presentations] == ["shared-deck"]
                role = await get_access_role(session, presentations[0])
                assert role == "editor"
                await require_presentation_access(
                    session, presentations[0], write=True
                )
        finally:
            reset_current_owner_id(editor_token)

        viewer_token = set_current_owner_id(viewer_id)
        try:
            async with session_maker() as session:
                presentations = list(
                    (await session.scalars(select(PresentationModel))).all()
                )
                assert [item.content for item in presentations] == ["shared-deck"]
                try:
                    await require_presentation_access(
                        session, presentations[0], write=True
                    )
                    raise AssertionError("viewer should not write")
                except HTTPException as exc:
                    assert exc.status_code == 403
        finally:
            reset_current_owner_id(viewer_token)

        await engine.dispose()

    asyncio.run(run())

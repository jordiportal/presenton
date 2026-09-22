import asyncio
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from api.v1.auth.context import reset_current_owner_id, set_current_owner_id
from models.sql.presentation import PresentationModel, PresentationVersion
from models.sql.presentation_share import PresentationShare
from models.sql.slide import SlideModel
from models.sql.template_v2 import TemplateV2
from models.sql.user import User
from services import database as _database_events  # noqa: F401


def test_owned_queries_are_isolated_and_only_default_templates_are_shared():
    async def run():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        session_maker = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as connection:
            await connection.run_sync(User.__table__.create)
            await connection.run_sync(PresentationModel.__table__.create)
            await connection.run_sync(PresentationShare.__table__.create)
            await connection.run_sync(TemplateV2.__table__.create)

        first_id, second_id = uuid.uuid4(), uuid.uuid4()
        async with session_maker() as session:
            session.add_all(
                [
                    User(
                        id=first_id,
                        username="first",
                        hashed_password="unused",
                        is_active=True,
                        is_superuser=False,
                        is_verified=True,
                    ),
                    User(
                        id=second_id,
                        username="second",
                        hashed_password="unused",
                        is_active=True,
                        is_superuser=False,
                        is_verified=True,
                    ),
                    PresentationModel(
                        owner_id=first_id,
                        version=PresentationVersion.V2_STANDARD,
                        content="first",
                        n_slides=1,
                        language="English",
                    ),
                    PresentationModel(
                        owner_id=second_id,
                        version=PresentationVersion.V2_STANDARD,
                        content="second",
                        n_slides=1,
                        language="English",
                    ),
                    TemplateV2(
                        id="shared",
                        owner_id=None,
                        name="Shared",
                        is_default=True,
                    ),
                    TemplateV2(
                        id="unowned-private",
                        owner_id=None,
                        name="Unowned private",
                        is_default=False,
                    ),
                    TemplateV2(
                        id="second-private",
                        owner_id=second_id,
                        name="Second private",
                        is_default=False,
                    ),
                ]
            )
            await session.commit()

        context_token = set_current_owner_id(first_id)
        try:
            async with session_maker() as session:
                presentations = (
                    await session.scalars(select(PresentationModel))
                ).all()
                templates = (await session.scalars(select(TemplateV2))).all()
        finally:
            reset_current_owner_id(context_token)
            await engine.dispose()

        assert [item.content for item in presentations] == ["first"]
        assert [item.id for item in templates] == ["shared"]

    asyncio.run(run())


def test_slides_follow_presentation_access_not_slide_creator():
    """Everyone with access to a presentation sees ALL its slides.

    Regression: previously slides were scoped by their own ``owner_id`` (the
    creator), so the presentation owner could not see slides authored by
    collaborators, and vice versa.
    """

    async def run():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        session_maker = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as connection:
            await connection.run_sync(User.__table__.create)
            await connection.run_sync(PresentationModel.__table__.create)
            await connection.run_sync(PresentationShare.__table__.create)
            await connection.run_sync(SlideModel.__table__.create)

        owner_id, editor_id, stranger_id = (
            uuid.uuid4(),
            uuid.uuid4(),
            uuid.uuid4(),
        )
        presentation_id = uuid.uuid4()

        def make_user(uid: str, name: str) -> User:
            return User(
                id=uid,
                username=name,
                hashed_password="unused",
                is_active=True,
                is_superuser=False,
                is_verified=True,
            )

        def make_slide(creator: str, index: int) -> SlideModel:
            return SlideModel(
                owner_id=creator,
                presentation=presentation_id,
                layout_group="g",
                layout="l",
                index=index,
                content={},
                properties={},
            )

        async with session_maker() as session:
            session.add_all(
                [
                    make_user(owner_id, "owner"),
                    make_user(editor_id, "editor"),
                    make_user(stranger_id, "stranger"),
                    PresentationModel(
                        id=presentation_id,
                        owner_id=owner_id,
                        version=PresentationVersion.V2_STANDARD,
                        content="deck",
                        n_slides=2,
                        language="English",
                    ),
                    PresentationShare(
                        presentation_id=presentation_id,
                        shared_with_user_id=editor_id,
                        role="editor",
                        created_by=owner_id,
                    ),
                    make_slide(owner_id, 0),
                    make_slide(editor_id, 1),
                ]
            )
            await session.commit()

        async def slide_indices_for(uid) -> list[int]:
            token = set_current_owner_id(uid)
            try:
                async with session_maker() as session:
                    slides = (
                        await session.scalars(
                            select(SlideModel).order_by(SlideModel.index)
                        )
                    ).all()
                    return [slide.index for slide in slides]
            finally:
                reset_current_owner_id(token)

        owner_view = await slide_indices_for(owner_id)
        editor_view = await slide_indices_for(editor_id)
        stranger_view = await slide_indices_for(stranger_id)
        await engine.dispose()

        # Owner sees the editor's slide; editor sees the owner's slide.
        assert owner_view == [0, 1]
        assert editor_view == [0, 1]
        # A user without access sees none.
        assert stranger_view == []

    asyncio.run(run())

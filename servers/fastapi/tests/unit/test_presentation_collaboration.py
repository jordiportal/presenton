import asyncio
import uuid
from types import SimpleNamespace

from fastapi import HTTPException

from api.v1.ppt.endpoints import presentation as presentation_mod
from api.v1.ppt.endpoints.presentation import (
    _sync_presentation_slides,
    update_presentation_slide,
)
from models.sql.slide import SlideModel
from tests.conftest import FakeAsyncSession


def _slide(
    *,
    slide_id: uuid.UUID | None = None,
    presentation_id: uuid.UUID | None = None,
    index: int = 0,
    title: str = "Original",
) -> SlideModel:
    return SlideModel(
        id=slide_id or uuid.uuid4(),
        presentation=presentation_id or uuid.uuid4(),
        layout_group="general",
        layout="title",
        index=index,
        content={"title": title},
        properties={"accent": "blue"},
        ui={"components": []},
    )


class SlideSyncSession:
    def __init__(self, stored: list[SlideModel]):
        self._stored = list(stored)
        self.deleted: list[SlideModel] = []
        self.added: list[SlideModel] = []

    async def scalars(self, *_args, **_kwargs):
        return list(self._stored)

    async def delete(self, obj: SlideModel) -> None:
        self.deleted.append(obj)
        self._stored = [item for item in self._stored if item.id != obj.id]

    def add(self, obj: SlideModel) -> None:
        self.added.append(obj)


def test_sync_updates_index_but_skips_foreign_slide_content(monkeypatch):
    asyncio.run(_test_sync_updates_index_but_skips_foreign_slide_content(monkeypatch))


async def _test_sync_updates_index_but_skips_foreign_slide_content(monkeypatch):
    presentation_id = uuid.uuid4()
    held = _slide(presentation_id=presentation_id, index=0, title="Mine")
    free = _slide(presentation_id=presentation_id, index=1, title="Free")
    session = SlideSyncSession([held, free])

    incoming_held = _slide(
        slide_id=held.id,
        presentation_id=presentation_id,
        index=0,
        title="Hijacked",
    )
    incoming_free = _slide(
        slide_id=free.id,
        presentation_id=presentation_id,
        index=1,
        title="Updated free",
    )

    async def fake_foreign(_sql, _pid, slide_id, _sid):
        if slide_id == held.id:
            return SimpleNamespace(scope=f"slide:{slide_id}", holder_name="Ana")
        return None

    monkeypatch.setattr(presentation_mod, "foreign_slide_lease", fake_foreign)
    monkeypatch.setattr(presentation_mod, "read_session_id", lambda _req: "session-b")

    synced = await _sync_presentation_slides(
        session,
        SimpleNamespace(id=presentation_id),
        [incoming_free, incoming_held],
        request=SimpleNamespace(),
    )

    assert held.content == {"title": "Mine"}
    assert held.index == 1
    assert free.content == {"title": "Updated free"}
    assert free.index == 0
    assert [slide.id for slide in synced] == [free.id, held.id]


def test_sync_rejects_deleting_a_foreign_leased_slide(monkeypatch):
    asyncio.run(_test_sync_rejects_deleting_a_foreign_leased_slide(monkeypatch))


async def _test_sync_rejects_deleting_a_foreign_leased_slide(monkeypatch):
    presentation_id = uuid.uuid4()
    held = _slide(presentation_id=presentation_id)
    other = _slide(presentation_id=presentation_id, index=1)
    session = SlideSyncSession([held, other])

    async def fake_foreign(_sql, _pid, slide_id, _sid):
        if slide_id == held.id:
            return SimpleNamespace(scope=f"slide:{slide_id}", holder_name="Ana")
        return None

    monkeypatch.setattr(presentation_mod, "foreign_slide_lease", fake_foreign)
    monkeypatch.setattr(presentation_mod, "read_session_id", lambda _req: "session-b")

    with pytest.raises(HTTPException) as exc:
        await _sync_presentation_slides(
            session,
            SimpleNamespace(id=presentation_id),
            [other],
            request=SimpleNamespace(),
        )

    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "lease_held"
    assert session.deleted == []


def test_sync_inserts_and_deletes_unleased_slides(monkeypatch):
    asyncio.run(_test_sync_inserts_and_deletes_unleased_slides(monkeypatch))


async def _test_sync_inserts_and_deletes_unleased_slides(monkeypatch):
    presentation_id = uuid.uuid4()
    keep = _slide(presentation_id=presentation_id)
    gone = _slide(presentation_id=presentation_id, index=1)
    incoming_new = _slide(presentation_id=presentation_id, index=1)
    session = SlideSyncSession([keep, gone])

    async def no_lease(*_args, **_kwargs):
        return None

    monkeypatch.setattr(presentation_mod, "foreign_slide_lease", no_lease)
    monkeypatch.setattr(presentation_mod, "read_session_id", lambda _req: "session-a")

    synced = await _sync_presentation_slides(
        session,
        SimpleNamespace(id=presentation_id),
        [keep, incoming_new],
        request=SimpleNamespace(),
    )

    assert session.deleted == [gone]
    assert incoming_new in session.added
    assert [slide.id for slide in synced] == [keep.id, incoming_new.id]


def test_slide_update_rejects_foreign_lease(monkeypatch):
    stored = _slide()
    incoming = _slide(
        slide_id=stored.id,
        presentation_id=stored.presentation,
        title="Updated",
    )
    session = FakeAsyncSession(get_results={stored.id: stored})

    async def deny(*_args, **_kwargs):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "lease_held",
                "holder_name": "Ana",
                "message": "Ana is editing this slide.",
            },
        )

    monkeypatch.setattr(presentation_mod, "enforce_slide_write", deny)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            update_presentation_slide(
                slide=incoming,
                sql_session=session,
                request=SimpleNamespace(),
            )
        )

    assert exc_info.value.status_code == 409
    assert session.commit_count == 0
    assert stored.content == {"title": "Original"}

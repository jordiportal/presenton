import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.v1.ppt.endpoints import presentation as presentation_endpoints
from api.v1.ppt.endpoints.presentation import PRESENTATION_ROUTER
from models.declared_artifact import (
    DEFAULT_DECK_NAME,
    MAX_NAME_LENGTH,
    PRESENTATION_MIME,
    deck_artifact,
    deck_name,
)
from models.presentation_and_path import PresentationPathAndEditPath
from services.database import get_async_session


class _Session:
    def __init__(self, objects: dict[Any, Any] | None = None):
        self._objects = objects or {}

    async def get(self, _model: Any, key: Any):
        return self._objects.get(key) or self._objects.get(str(key))

    def add(self, obj: Any) -> None:
        if getattr(obj, "id", None) is None:
            obj.id = f"task-{uuid.uuid4().hex}"

    async def commit(self) -> None:
        return None

    async def refresh(self, _obj: Any) -> None:
        return None


def _client(session: _Session) -> TestClient:
    app = FastAPI()
    app.include_router(PRESENTATION_ROUTER)
    app.dependency_overrides[get_async_session] = lambda: session
    return TestClient(app)


def test_deck_name_prefiere_titulo_y_limpia_markdown():
    assert deck_name("Q3 kickoff", "otra cosa") == "Q3 kickoff"
    assert deck_name(None, "\n\n# Plan de ventas 2027\nDetalle") == "Plan de ventas 2027"
    assert deck_name("  ", "") == DEFAULT_DECK_NAME
    assert len(deck_name(None, "x" * 500)) == MAX_NAME_LENGTH


def test_deck_artifact_es_el_bloque_que_lee_brain():
    deck_id = uuid.uuid4()
    block = deck_artifact(deck_id, "Q3", 8).model_dump()
    assert block["handler"] == "presenton"
    assert block["external_id"] == str(deck_id)
    assert block["mime"] == PRESENTATION_MIME
    assert block["uri"] == f"presenton://deck/{deck_id}"
    assert block["slide_count"] == 8


def test_generate_sincrono_devuelve_artifact_con_titulo_del_deck():
    deck_id = uuid.uuid4()
    deck = SimpleNamespace(id=deck_id, title="Kickoff Q3", n_slides=6)
    generated = PresentationPathAndEditPath(
        presentation_id=deck_id,
        path="/app_data/exports/kickoff.pptx",
        edit_path=f"/presentation?id={deck_id}",
    )
    with (
        patch.object(
            presentation_endpoints,
            "check_if_api_request_is_valid",
            AsyncMock(return_value=(deck_id,)),
        ),
        patch.object(
            presentation_endpoints,
            "generate_presentation_handler",
            AsyncMock(return_value=generated),
        ),
    ):
        response = _client(_Session({deck_id: deck})).post(
            "/presentation/generate",
            json={"content": "Kickoff del trimestre"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["edit_path"] == f"/presentation?id={deck_id}"
    assert body["artifact"]["external_id"] == str(deck_id)
    assert body["artifact"]["name"] == "Kickoff Q3"
    assert body["artifact"]["slide_count"] == 6


def test_generate_async_devuelve_artifact_y_status_no():
    deck_id = uuid.uuid4()
    session = _Session()
    with (
        patch.object(
            presentation_endpoints,
            "check_if_api_request_is_valid",
            AsyncMock(return_value=(deck_id,)),
        ),
        patch.object(
            presentation_endpoints,
            "_run_generate_presentation_task",
            AsyncMock(),
        ),
    ):
        client = _client(session)
        queued = client.post(
            "/presentation/generate/async",
            json={"content": "Informe mensual\ncon ventas", "n_slides": 5},
        )

    assert queued.status_code == 200
    body = queued.json()
    assert body["status"] == "pending"
    assert body["data"]["presentation_id"] == str(deck_id)
    assert body["artifact"]["external_id"] == str(deck_id)
    assert body["artifact"]["name"] == "Informe mensual"
    assert body["artifact"]["slide_count"] == 5

    task = SimpleNamespace(
        id=body["id"],
        type=body["type"],
        status="completed",
        message="done",
        error=None,
        data={"presentation_id": str(deck_id)},
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    status = _client(_Session({body["id"]: task})).get(f"/presentation/status/{body['id']}")
    assert status.status_code == 200
    assert "artifact" not in status.json()

import json
import uuid
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.v1.ppt.endpoints import ops
from api.v1.ppt.endpoints.ops import OPS_ROUTER, request_schema, tool_catalog
from api.v1.ppt.endpoints.presentation import PRESENTATION_ROUTER
from api.v1.ppt.endpoints.slide import SLIDE_ROUTER
from services.database import get_async_session


class _Session:
    def __init__(self, presentations: dict[uuid.UUID, Any]):
        self._presentations = presentations

    async def get(self, _model: Any, key: Any):
        return self._presentations.get(key)


def _route_ids(router) -> dict[str, str]:
    return {
        route.operation_id: route.path
        for route in router.routes
        if getattr(route, "operation_id", None)
    }


def _client(presentation: Any | None) -> TestClient:
    app = FastAPI()
    app.include_router(OPS_ROUTER)
    sessions = {presentation.id: presentation} if presentation else {}
    app.dependency_overrides[get_async_session] = lambda: _Session(sessions)
    return TestClient(app)


def _deck(mode: str = "standard") -> SimpleNamespace:
    return SimpleNamespace(id=uuid.uuid4(), generation_mode=mode)


def _contains_ref(node: Any) -> bool:
    if isinstance(node, dict):
        return "$ref" in node or "$defs" in node or any(_contains_ref(v) for v in node.values())
    if isinstance(node, list):
        return any(_contains_ref(v) for v in node)
    return False


def test_operation_ids_son_estables_y_por_familia():
    ids = _route_ids(OPS_ROUTER)
    assert ids["deck_add_element"] == "/ops/add_element"
    assert ids["deck_update_component"] == "/ops/update_component"
    assert ids["deck_get_slide_at_index"] == "/ops/get_slide_at_index"
    assert ids["deck_smart_save_slide"] == "/ops/smart/save_slide"
    assert ids["deck_smart_get_smart_presentation_context"] == (
        "/ops/smart/get_smart_presentation_context"
    )


def test_assets_con_el_motor_de_presenton_y_sin_alias():
    ids = _route_ids(OPS_ROUTER)
    assert ids["deck_generate_assets"] == "/ops/generate_assets"
    assert ids["deck_smart_generate_assets"] == "/ops/smart/generate_assets"
    assert "deck_create_component" not in ids


def test_no_chocan_con_operation_ids_existentes():
    existing = set(_route_ids(PRESENTATION_ROUTER)) | set(_route_ids(SLIDE_ROUTER))
    assert not existing & set(_route_ids(OPS_ROUTER))


@pytest.mark.parametrize("deck_type", ["standard", "smart"])
def test_esquemas_en_linea_sin_ref(deck_type):
    for tool in tool_catalog(deck_type):
        schema = request_schema(tool)
        assert not _contains_ref(schema), tool.name
        assert schema["required"][0] == "presentation_id"
        assert "user_request" not in schema["required"]


def test_campos_nullable_no_son_obligatorios():
    tool = next(t for t in tool_catalog("standard") if t.name == "updateElement")
    schema = request_schema(tool)
    assert {"index", "elementPath"} <= set(schema["required"])
    assert "chart" not in schema["required"]
    assert schema["properties"]["chart"]["anyOf"][0]["type"] == "object"


def test_despacha_la_tool_con_el_cuerpo_sin_campos_reservados():
    deck = _deck()
    execute = AsyncMock(return_value={"ok": True, "tool": "updateElement", "result": {}})
    access = AsyncMock(return_value="owner")
    with (
        patch.object(ops, "require_presentation_access", access),
        patch.object(ops, "PresentationContextStore", MagicMock()),
        patch.object(ops.ChatTools, "execute_tool_call", execute),
        patch.object(ops.ChatTools, "set_turn_context") as turn,
    ):
        response = _client(deck).post(
            "/ops/update_element",
            json={
                "presentation_id": str(deck.id),
                "user_request": "Pon el título en rojo",
                "index": 0,
                "elementPath": "components[0].elements[0]",
                "text": "Q3",
            },
        )

    assert response.status_code == 200
    assert response.json()["ok"] is True
    tool_call = execute.await_args.args[0]
    assert tool_call.name == "updateElement"
    assert json.loads(tool_call.arguments) == {
        "index": 0,
        "elementPath": "components[0].elements[0]",
        "text": "Q3",
    }
    turn.assert_called_once_with("Pon el título en rojo")
    assert access.await_args.kwargs == {"write": True}


def test_lectura_no_pide_permiso_de_escritura():
    deck = _deck()
    access = AsyncMock(return_value="viewer")
    with (
        patch.object(ops, "require_presentation_access", access),
        patch.object(ops, "PresentationContextStore", MagicMock()),
        patch.object(ops.ChatTools, "execute_tool_call", AsyncMock(return_value={"ok": True})),
    ):
        response = _client(deck).post(
            "/ops/get_slide_at_index",
            json={"presentation_id": str(deck.id), "index": 0},
        )

    assert response.status_code == 200
    assert access.await_args.kwargs == {"write": False}


def test_familia_equivocada_indica_la_operacion_correcta():
    deck = _deck("smart")
    with patch.object(ops, "require_presentation_access", AsyncMock()):
        response = _client(deck).post(
            "/ops/save_slide",
            json={"presentation_id": str(deck.id), "index": 0},
        )

    assert response.status_code == 409
    assert "deck_smart_save_slide" in response.json()["detail"]


def test_deck_inexistente_e_id_invalido():
    client = _client(None)
    missing = client.post("/ops/delete_slide", json={"presentation_id": str(uuid.uuid4())})
    invalid = client.post("/ops/delete_slide", json={"presentation_id": "nope"})
    assert missing.status_code == 404
    assert invalid.status_code == 422

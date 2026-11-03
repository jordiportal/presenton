import asyncio
import uuid
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.v1.ppt.endpoints import presentation as presentation_endpoints
from api.v1.ppt.endpoints.presentation import PRESENTATION_ROUTER
from models.generate_presentation_request import GeneratePresentationRequest
from services.database import get_async_session

CUSTOM_ID = "8d5f2c1e-0000-4000-8000-000000000001"


class _Result:
    def __init__(self, value: Any):
        self._value = value

    def scalars(self):
        return self

    def first(self):
        return self._value


class _Session:
    """Sesión mínima: TemplateV2 por id y por nombre (case-insensitive)."""

    def __init__(self, templates: dict[str, str] | None = None):
        self.templates = templates or {}
        self.added: list[Any] = []

    async def get(self, _model: Any, key: Any):
        name = self.templates.get(str(key))
        return SimpleNamespace(id=str(key), name=name) if name else None

    async def execute(self, statement: Any):
        wanted = str(statement.compile(compile_kwargs={"literal_binds": True}))
        for template_id, name in self.templates.items():
            if f"'{name.lower()}'" in wanted:
                return _Result(template_id)
        return _Result(None)

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    async def commit(self) -> None:
        return None

    async def refresh(self, _obj: Any) -> None:
        return None


def _client(session: _Session) -> TestClient:
    app = FastAPI()
    app.include_router(PRESENTATION_ROUTER)
    app.dependency_overrides[get_async_session] = lambda: session
    return TestClient(app)


def _run(coro):
    return asyncio.run(coro)


def test_find_template_id_acepta_id_y_nombre_visible():
    session = _Session({CUSTOM_ID: "Corporativa KH"})
    assert _run(presentation_endpoints._find_template_id(CUSTOM_ID, session)) == CUSTOM_ID
    assert (
        _run(presentation_endpoints._find_template_id("corporativa kh", session))
        == CUSTOM_ID
    )
    assert _run(presentation_endpoints._find_template_id("no-existe", session)) is None
    assert _run(presentation_endpoints._find_template_id("  ", session)) is None


def test_default_template_usa_settings_y_cae_a_general():
    session = _Session({CUSTOM_ID: "Corporativa KH"})
    with patch.object(
        presentation_endpoints,
        "get_provider_settings",
        AsyncMock(return_value={"DEFAULT_TEMPLATE": CUSTOM_ID}),
    ):
        assert _run(presentation_endpoints._default_template(session)) == CUSTOM_ID

    with patch.object(
        presentation_endpoints,
        "get_provider_settings",
        AsyncMock(return_value={"DEFAULT_TEMPLATE": "borrada"}),
    ):
        assert _run(presentation_endpoints._default_template(session)) == "general"

    with patch.object(
        presentation_endpoints, "get_provider_settings", AsyncMock(return_value={})
    ):
        assert _run(presentation_endpoints._default_template(session)) == "general"


def test_generate_sin_template_usa_el_por_defecto():
    session = _Session({CUSTOM_ID: "Corporativa KH"})
    request = GeneratePresentationRequest(content="Plan comercial")
    assert request.template is None
    with patch.object(
        presentation_endpoints,
        "get_provider_settings",
        AsyncMock(return_value={"DEFAULT_TEMPLATE": CUSTOM_ID}),
    ):
        _run(presentation_endpoints.check_if_api_request_is_valid(request, session))
    assert request.template == CUSTOM_ID


def test_create_guarda_la_plantilla_resuelta():
    session = _Session({CUSTOM_ID: "Corporativa KH"})
    with patch.object(
        presentation_endpoints,
        "get_web_search_route",
        return_value=(None, None),
    ):
        response = _client(session).post(
            "/presentation/create",
            json={"content": "Kickoff", "template": "Corporativa KH"},
        )
    assert response.status_code == 200, response.text
    assert session.added[0].template == CUSTOM_ID


def test_create_rechaza_plantilla_desconocida():
    session = _Session()
    response = _client(session).post(
        "/presentation/create",
        json={"content": "Kickoff", "template": "no-existe"},
    )
    assert response.status_code == 400
    assert "template_list" in response.json()["detail"]
    assert session.added == []

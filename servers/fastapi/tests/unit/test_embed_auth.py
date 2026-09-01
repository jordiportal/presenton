import time
import uuid

import jwt
from starlette.requests import Request

from api.v1.auth.embed import (
    ALG,
    AUD,
    BRAIN_EMBED_OWNER_ID,
    ISS,
    classify_embed_token,
    extract_embed_token,
    verify_brain_embed_jwt,
)


SECRET = "presenton-embed-secret-32-bytes-min"


def _request(*, authorization: str | None = None, query: str = "", cookie: str | None = None):
    headers = []
    if authorization:
        headers.append((b"authorization", authorization.encode()))
    if cookie:
        headers.append((b"cookie", cookie.encode()))
    return Request(
        {
            "type": "http",
            "method": "GET",
            "scheme": "http",
            "path": "/api/v1/ppt/presentation/x",
            "query_string": query.encode(),
            "headers": headers,
            "client": ("127.0.0.1", 1234),
            "server": ("127.0.0.1", 8000),
        }
    )


def _brain_jwt(secret: str = SECRET, **overrides) -> str:
    now = int(time.time())
    payload = {
        "iss": ISS,
        "aud": AUD,
        "sub": "user-1",
        "iat": now,
        "exp": now + 3600,
        "handler": "presenton",
        "artifact_id": "art-1",
        "external_id": str(uuid.uuid4()),
        "surface": "editor",
    }
    payload.update(overrides)
    return jwt.encode(payload, secret, algorithm=ALG)


def test_classify_acepta_bearer_plano():
    assert classify_embed_token(SECRET, SECRET) == "service"


def test_classify_acepta_jwt_brain():
    assert classify_embed_token(_brain_jwt(), SECRET) == "embed"


def test_classify_rechaza_secreto_ajeno():
    assert classify_embed_token("otro-secreto", SECRET) is None
    assert classify_embed_token(_brain_jwt(secret="otro-secreto"), SECRET) is None


def test_verify_rechaza_caducado():
    token = _brain_jwt(exp=int(time.time()) - 10)
    try:
        verify_brain_embed_jwt(token, SECRET)
        raised = False
    except jwt.ExpiredSignatureError:
        raised = True
    assert raised


def test_extract_prioridad_authorization_sobre_query():
    request = _request(authorization=f"Bearer {SECRET}", query="token=query-token")
    assert extract_embed_token(request) == SECRET


def test_extract_query_y_cookie():
    assert extract_embed_token(_request(query="token=from-query")) == "from-query"
    assert (
        extract_embed_token(_request(cookie="presenton_embed=from-cookie"))
        == "from-cookie"
    )


def test_resolve_principal_servicio(monkeypatch):
    from api.v1.auth.principal import resolve_request_principal

    monkeypatch.setenv("PRESENTON_EMBED_SECRET", SECRET)

    class UnusedSession:
        async def get(self, *_args, **_kwargs):
            raise AssertionError("service bearer no consulta la DB")

    principal, user = __import__("asyncio").run(
        resolve_request_principal(
            _request(authorization=f"Bearer {SECRET}"),
            UnusedSession(),
        )
    )
    assert user is None
    assert principal is not None
    assert principal.method == "service"
    assert principal.user_id == BRAIN_EMBED_OWNER_ID
    assert principal.is_admin is True


def test_ensure_embed_owner_crea_la_fila(monkeypatch):
    from api.v1.auth.embed import BRAIN_EMBED_OWNER_ID, ensure_embed_owner_user

    monkeypatch.setenv("PRESENTON_EMBED_SECRET", SECRET)

    stored = {}

    class FakeSession:
        async def get(self, _model, user_id):
            return stored.get(user_id)

        async def scalar(self, _stmt):
            return None

        def add(self, user):
            stored[user.id] = user

        async def commit(self):
            return None

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

    monkeypatch.setattr(
        "services.database.async_session_maker",
        lambda: FakeSession(),
    )

    __import__("asyncio").run(ensure_embed_owner_user())
    user = stored[BRAIN_EMBED_OWNER_ID]
    assert user.username == "brain-service"
    assert user.is_active is True


def test_resolve_principal_jwt_embed(monkeypatch):
    from api.v1.auth.principal import resolve_request_principal

    monkeypatch.setenv("PRESENTON_EMBED_SECRET", SECRET)

    class UnusedSession:
        async def get(self, *_args, **_kwargs):
            raise AssertionError("embed JWT no consulta la DB")

    principal, user = __import__("asyncio").run(
        resolve_request_principal(
            _request(authorization=f"Bearer {_brain_jwt()}"),
            UnusedSession(),
        )
    )
    assert user is None
    assert principal is not None
    assert principal.method == "embed"
    assert principal.username == "brain-embed"

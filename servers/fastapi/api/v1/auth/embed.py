"""Auth de embed / servicio para Brain (pack creative-presenton).

El mismo secreto (``PRESENTON_EMBED_SECRET``) sirve para:

- Bearer plano: tools OpenAPI de Brain (``auth_type: bearer``).
- JWT HS256 (``iss=brain``, ``aud=brain.embed``): iframe ``?token=``.

Ambos principals comparten un ``owner_id`` estable para que los assets
creados por las tools sean visibles en el embed (misma carpeta
``/app_data/.../users/<id>/``).
"""

from __future__ import annotations

import hmac
import logging
import secrets
import uuid
from typing import Any, Literal

import jwt
from fastapi import Request
from sqlalchemy import select

from utils.get_env import get_presenton_embed_secret_env

logger = logging.getLogger(__name__)

ISS = "brain"
AUD = "brain.embed"
ALG = "HS256"
EMBED_COOKIE_NAME = "presenton_embed"

# Owner compartido del runtime embebido (no es un User de Presenton).
BRAIN_EMBED_OWNER_ID = uuid.UUID("00000000-0000-4000-a000-0000000000b1")

EmbedMethod = Literal["embed", "service"]


def get_embed_secret() -> str | None:
    return get_presenton_embed_secret_env()


def extract_embed_token(request: Request) -> str | None:
    authorization = request.headers.get("Authorization", "")
    if authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        if token:
            return token
    query_token = (request.query_params.get("token") or "").strip()
    if query_token:
        return query_token
    cookie_token = (request.cookies.get(EMBED_COOKIE_NAME) or "").strip()
    if cookie_token:
        return cookie_token
    return None


def verify_brain_embed_jwt(token: str, secret: str) -> dict[str, Any]:
    return jwt.decode(token, secret, algorithms=[ALG], audience=AUD, issuer=ISS)


def classify_embed_token(token: str, secret: str) -> EmbedMethod | None:
    if hmac.compare_digest(token, secret):
        return "service"
    try:
        verify_brain_embed_jwt(token, secret)
    except jwt.PyJWTError:
        return None
    return "embed"


def resolve_embed_auth(request: Request) -> EmbedMethod | None:
    secret = get_embed_secret()
    if not secret:
        return None
    token = extract_embed_token(request)
    if not token:
        return None
    return classify_embed_token(token, secret)


async def ensure_embed_owner_user() -> None:
    """Crea la fila ``user`` del owner embebido.

    Las tablas de Presenton tienen ``owner_id`` con FK a ``user.id``. El
    Bearer/JWT de Brain usa ``BRAIN_EMBED_OWNER_ID``, que no es una cuenta
    local: sin esta fila, generar un deck revienta con 500 (FK).
    """
    if not get_embed_secret():
        return

    from api.v1.auth.users import PASSWORD_HELPER
    from models.sql.user import User
    from services.database import async_session_maker

    async with async_session_maker() as session:
        existing = await session.get(User, BRAIN_EMBED_OWNER_ID)
        if existing is not None:
            return
        taken = await session.scalar(
            select(User).where(User.username == "brain-service")
        )
        username = "brain-service" if taken is None else f"brain-service-{BRAIN_EMBED_OWNER_ID.hex[:8]}"
        session.add(
            User(
                id=BRAIN_EMBED_OWNER_ID,
                username=username,
                hashed_password=PASSWORD_HELPER.hash(secrets.token_hex(32)),
                is_active=True,
                is_superuser=True,
                is_verified=True,
                auth_version=1,
            )
        )
        await session.commit()
        logger.info("Created Brain embed owner user id=%s", BRAIN_EMBED_OWNER_ID)


async def seed_provider_settings_from_env() -> None:
    """Si el pack inyectó LLM por env y la DB no tiene proveedor, lo persiste.

    ``migrate_provider_settings_from_file`` puede reescribir userConfig con un
    config vacío guardado en un arranque anterior y dejar el proceso sin
    modelo. El runtime embebido no tiene UI de setup.
    """
    import os

    if not get_embed_secret():
        return
    llm = (os.getenv("LLM") or "").strip()
    if not llm:
        return

    from services.database import async_session_maker
    from services.provider_settings import get_provider_settings, save_provider_settings

    incoming = {"LLM": llm}
    for key in (
        "CUSTOM_LLM_URL",
        "CUSTOM_LLM_API_KEY",
        "CUSTOM_MODEL",
        "DISABLE_IMAGE_GENERATION",
        "LLM_REASONING_EFFORT",
        "LLM_MAX_OUTPUT_TOKENS",
    ):
        val = os.getenv(key)
        if val:
            incoming[key] = val
    incoming.setdefault("LLM_REASONING_EFFORT", "low")

    async with async_session_maker() as session:
        current = await get_provider_settings(session)
        if (current.get("LLM") or "").strip():
            return
        await save_provider_settings(session, incoming)
        logger.info("Seeded Presenton provider settings from pack env llm=%s", llm)

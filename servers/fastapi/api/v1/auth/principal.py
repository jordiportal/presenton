from dataclasses import dataclass
from typing import Literal
import uuid

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from api.v1.auth.embed import (
    BRAIN_EMBED_OWNER_ID,
    classify_embed_token,
    extract_embed_token,
    resolve_embed_auth,
    verify_brain_embed_jwt,
)
from api.v1.auth.keycloak import ensure_presenton_user_from_sso
from utils.get_env import get_presenton_embed_secret_env
from api.v1.auth.users import UsernameUserDatabase, UserManager, get_jwt_strategy
from models.sql.access_token import AccessToken
from models.sql.user import User
from api.v1.auth.config import SESSION_COOKIE_NAME


@dataclass(frozen=True)
class AuthPrincipal:
    user_id: uuid.UUID
    username: str
    is_admin: bool
    method: Literal["jwt", "api_key", "embed", "service"]


async def _user_for_brain_subject(session: AsyncSession, subject: str) -> User | None:
    """El ``sub`` del embed es el email de Brain, el mismo de Keycloak."""
    identity = (subject or "").strip().lower()
    if "@" not in identity:
        return None
    return await ensure_presenton_user_from_sso(session, identity)


def _explicit_embed_token(request: Request) -> str | None:
    """Bearer o ``?token=``. La cookie de embed no pisa una sesión del navegador."""
    authorization = request.headers.get("Authorization", "")
    if authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        if token and not token.startswith("sk-presenton-"):
            return token
    return (request.query_params.get("token") or "").strip() or None


async def _principal_for_embed_jwt(
    token: str, session: AsyncSession
) -> tuple[AuthPrincipal | None, User | None]:
    secret = get_presenton_embed_secret_env() or ""
    try:
        claims = verify_brain_embed_jwt(token, secret)
    except Exception:
        return None, None
    user = await _user_for_brain_subject(session, str(claims.get("sub") or ""))
    if user is None:
        return None, None
    return (
        AuthPrincipal(
            user_id=user.id,
            username=user.username,
            is_admin=user.is_superuser,
            method="embed",
        ),
        user,
    )


async def resolve_request_principal(
    request: Request, session: AsyncSession
) -> tuple[AuthPrincipal | None, User | None]:
    explicit = _explicit_embed_token(request)
    if explicit and classify_embed_token(explicit, get_presenton_embed_secret_env() or "") == "embed":
        return await _principal_for_embed_jwt(explicit, session)

    cookie_token = request.cookies.get(SESSION_COOKIE_NAME)
    if cookie_token:
        user_db = UsernameUserDatabase(session)
        user = await get_jwt_strategy().read_token(cookie_token, UserManager(user_db))
        if user:
            return (
                AuthPrincipal(
                    user_id=user.id,
                    username=user.username,
                    is_admin=user.is_superuser,
                    method="jwt",
                ),
                user,
            )

    authorization = request.headers.get("Authorization", "")
    if authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        if token.startswith("sk-presenton-"):
            access_token = await session.get(AccessToken, token)
            if access_token is None:
                return None, None
            user = await session.get(User, access_token.user_id)
            if user is None or not user.is_active or not user.is_superuser:
                return None, None
            return (
                AuthPrincipal(
                    user_id=user.id,
                    username=user.username,
                    is_admin=True,
                    method="api_key",
                ),
                user,
            )

    embed_method = resolve_embed_auth(request)
    if embed_method == "embed":
        token = extract_embed_token(request) or ""
        return await _principal_for_embed_jwt(token, session)
    if embed_method == "service":
        return (
            AuthPrincipal(
                user_id=BRAIN_EMBED_OWNER_ID,
                username="brain-service",
                is_admin=True,
                method="service",
            ),
            None,
        )

    return None, None


def principal_from_request(request: Request) -> AuthPrincipal:
    principal = getattr(request.state, "auth_principal", None)
    if principal is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return principal


def require_browser_admin_principal(request: Request) -> AuthPrincipal:
    principal = principal_from_request(request)
    if principal.method != "jwt" or not principal.is_admin:
        raise HTTPException(status_code=403, detail="Admin browser session required")
    return principal

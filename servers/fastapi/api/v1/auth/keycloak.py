"""Keycloak OIDC login for standalone Presenton (same realm as Brain)."""

from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urljoin

import httpx
import jwt
from jwt import PyJWKClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from api.v1.auth.users import PASSWORD_HELPER
from models.sql.user import User
from utils.get_env import (
    get_keycloak_client_id,
    get_keycloak_client_secret,
    get_keycloak_issuer,
    get_keycloak_public_issuer,
    get_keycloak_valid_issuers,
    is_keycloak_configured,
)

logger = logging.getLogger(__name__)


@dataclass
class KeycloakClaims:
    user_id: str
    name: str = ""
    sub: str = ""
    raw: dict[str, Any] = field(default_factory=dict)


def keycloak_public_config() -> dict[str, Any]:
    if not is_keycloak_configured():
        return {
            "enabled": False,
            "client_id": "",
            "authority": "",
            "redirect_uri": "",
        }
    return {
        "enabled": True,
        "client_id": get_keycloak_client_id(),
        "authority": get_keycloak_public_issuer(),
        "redirect_uri": "",
    }


def identity_from_claims(data: dict[str, Any]) -> str | None:
    for key in ("email", "preferred_username", "upn", "username"):
        value = data.get(key)
        if value and "@" in str(value):
            return str(value).strip().lower()
    for key in ("email", "preferred_username", "username"):
        value = data.get(key)
        if value:
            return str(value).strip().lower()
    return None


def normalize_sso_username(identity: str, sub: str = "") -> str:
    raw = (identity or "").strip()
    if len(raw) < 3:
        suffix = (sub or "user").replace("-", "")[:8] or "user"
        raw = f"kc_{suffix}"
    return raw[:128]


class KeycloakValidator:
    def __init__(self) -> None:
        self._jwks_client: PyJWKClient | None = None
        self._jwks_url_cached: str | None = None

    @staticmethod
    def is_enabled() -> bool:
        return is_keycloak_configured()

    def _jwks_url(self) -> str:
        return urljoin(get_keycloak_issuer() + "/", "protocol/openid-connect/certs")

    def _get_jwks_client(self) -> PyJWKClient:
        url = self._jwks_url()
        if self._jwks_client and self._jwks_url_cached == url:
            return self._jwks_client
        self._jwks_client = PyJWKClient(url, cache_keys=True, lifespan=3600)
        self._jwks_url_cached = url
        logger.info("Keycloak JWKS client initialized (%s)", url)
        return self._jwks_client

    @staticmethod
    def _audience_matches(aud: str | list[str] | None, client_id: str) -> bool:
        if aud is None:
            return False
        if isinstance(aud, str):
            return aud == client_id
        return client_id in aud

    def _decode_kc_jwt(self, token: str) -> dict[str, Any]:
        signing_key = self._get_jwks_client().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=get_keycloak_valid_issuers(),
            options={
                "verify_exp": True,
                "verify_iss": True,
                "verify_aud": False,
            },
        )

    async def _fetch_userinfo(self, access_token: str) -> dict[str, Any]:
        url = urljoin(get_keycloak_issuer() + "/", "protocol/openid-connect/userinfo")
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                url,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if resp.status_code != 200:
                logger.warning("Keycloak userinfo failed (%s)", resp.status_code)
                return {}
            return resp.json()

    async def validate_oidc_tokens(
        self,
        id_token: str,
        access_token: str | None = None,
    ) -> KeycloakClaims:
        if not self.is_enabled():
            raise ValueError("Keycloak authentication is not enabled")

        client_id = get_keycloak_client_id()
        try:
            decoded = self._decode_kc_jwt(id_token)
        except jwt.ExpiredSignatureError:
            raise ValueError("Token has expired") from None
        except jwt.InvalidIssuerError:
            raise ValueError("Token issuer does not match Keycloak realm") from None
        except jwt.InvalidTokenError as exc:
            raise ValueError(f"Invalid token: {exc}") from exc
        except Exception as exc:
            logger.warning("Keycloak JWKS resolution failed: %s", exc)
            raise ValueError(f"Cannot resolve signing key: {exc}") from exc

        if not self._audience_matches(decoded.get("aud"), client_id):
            if decoded.get("azp") != client_id:
                raise ValueError("Token audience does not match configured client_id")

        identity = identity_from_claims(decoded)
        merged: dict[str, Any] = dict(decoded)

        if not identity and access_token:
            try:
                access_claims = self._decode_kc_jwt(access_token)
                merged.update(
                    {key: value for key, value in access_claims.items() if key not in merged}
                )
                identity = identity_from_claims(access_claims)
            except Exception as exc:
                logger.warning("Could not decode access_token for claims: %s", exc)

        if not identity and access_token:
            userinfo = await self._fetch_userinfo(access_token)
            if userinfo:
                merged.update(
                    {key: value for key, value in userinfo.items() if key not in merged}
                )
                identity = identity_from_claims(userinfo)

        if not identity:
            raise ValueError(
                "Token does not contain email or preferred_username. "
                "Add email mappers to the Presenton Keycloak client."
            )

        return KeycloakClaims(
            user_id=identity,
            name=merged.get("name", "") or "",
            sub=merged.get("sub", "") or "",
            raw=merged,
        )


keycloak_validator = KeycloakValidator()


async def exchange_authorization_code(
    code: str,
    redirect_uri: str,
    code_verifier: str,
) -> dict[str, Any]:
    """Exchange authorization code + PKCE (server → Keycloak, no browser CORS)."""
    data = {
        "grant_type": "authorization_code",
        "client_id": get_keycloak_client_id(),
        "code": code,
        "redirect_uri": redirect_uri,
        "code_verifier": code_verifier,
        "scope": "openid",
    }
    secret = get_keycloak_client_secret()
    if secret:
        data["client_secret"] = secret

    token_url = urljoin(get_keycloak_issuer() + "/", "protocol/openid-connect/token")
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(token_url, data=data)
        if resp.status_code != 200:
            logger.warning(
                "Keycloak code exchange failed (%s): %s",
                resp.status_code,
                resp.text[:300],
            )
            try:
                err = resp.json()
                desc = err.get("error_description") or err.get("error") or resp.text
            except Exception:
                desc = resp.text[:200]
            raise ValueError(f"Keycloak token exchange failed: {desc}")
        return resp.json()


async def _account_count(session: AsyncSession) -> int:
    return int(await session.scalar(select(func.count()).select_from(User)) or 0)


async def _get_user_by_username(session: AsyncSession, username: str) -> User | None:
    return await session.scalar(
        select(User).where(func.lower(User.username) == username.casefold())
    )


async def ensure_presenton_user_from_sso(
    session: AsyncSession,
    identity: str,
    sub: str = "",
) -> User:
    """Map Keycloak identity to a local Presenton user; first account is admin."""
    username = normalize_sso_username(identity, sub)
    existing = await _get_user_by_username(session, username)
    if existing is not None:
        if not existing.is_active:
            raise ValueError("User account is disabled")
        return existing

    is_first = await _account_count(session) == 0
    user = User(
        username=username,
        hashed_password=PASSWORD_HELPER.hash(secrets.token_urlsafe(32)),
        is_active=True,
        is_verified=True,
        is_superuser=is_first,
        admin_slot="primary" if is_first else None,
        auth_version=1,
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raced = await _get_user_by_username(session, username)
        if raced is not None:
            if not raced.is_active:
                raise ValueError("User account is disabled")
            return raced
        user = User(
            username=username,
            hashed_password=PASSWORD_HELPER.hash(secrets.token_urlsafe(32)),
            is_active=True,
            is_verified=True,
            is_superuser=False,
            admin_slot=None,
            auth_version=1,
        )
        session.add(user)
        await session.flush()
    await session.commit()
    await session.refresh(user)
    logger.info(
        "Provisioned SSO user %s (admin=%s)",
        user.username,
        user.is_superuser,
    )
    return user

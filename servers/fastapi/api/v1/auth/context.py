from contextvars import ContextVar, Token
import uuid


_CURRENT_OWNER_ID: ContextVar[uuid.UUID | None] = ContextVar(
    "presenton_current_owner_id", default=None
)
_CURRENT_OWNER_IS_ADMIN: ContextVar[bool] = ContextVar(
    "presenton_current_owner_is_admin", default=False
)
_SHARED_ASSET_OWNER_IDS: ContextVar[frozenset[uuid.UUID]] = ContextVar(
    "presenton_shared_asset_owner_ids", default=frozenset()
)


def get_current_owner_id() -> uuid.UUID | None:
    return _CURRENT_OWNER_ID.get()


def get_current_owner_is_admin() -> bool:
    return _CURRENT_OWNER_IS_ADMIN.get()


def set_current_owner_id(owner_id: uuid.UUID | None) -> Token:
    return _CURRENT_OWNER_ID.set(owner_id)


def set_current_owner_is_admin(is_admin: bool) -> Token:
    return _CURRENT_OWNER_IS_ADMIN.set(is_admin)


def reset_current_owner_id(token: Token) -> None:
    _CURRENT_OWNER_ID.reset(token)


def reset_current_owner_is_admin(token: Token) -> None:
    _CURRENT_OWNER_IS_ADMIN.reset(token)


def get_shared_asset_owner_ids() -> frozenset[uuid.UUID]:
    return _SHARED_ASSET_OWNER_IDS.get()


def set_shared_asset_owner_ids(owner_ids: set[uuid.UUID] | frozenset[uuid.UUID]) -> Token:
    return _SHARED_ASSET_OWNER_IDS.set(frozenset(owner_ids))


def reset_shared_asset_owner_ids(token: Token) -> None:
    _SHARED_ASSET_OWNER_IDS.reset(token)

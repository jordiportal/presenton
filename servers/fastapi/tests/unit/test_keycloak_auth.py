from utils.get_env import (
    get_keycloak_public_issuer,
    is_keycloak_configured,
)
from api.v1.auth.keycloak import (
    identity_from_claims,
    keycloak_public_config,
    normalize_sso_username,
)


def test_keycloak_disabled_by_default(monkeypatch):
    monkeypatch.delenv("KEYCLOAK_ENABLED", raising=False)
    monkeypatch.delenv("KEYCLOAK_BASE_URL", raising=False)
    monkeypatch.delenv("KEYCLOAK_REALM", raising=False)
    monkeypatch.delenv("KEYCLOAK_CLIENT_ID", raising=False)

    assert is_keycloak_configured() is False
    assert keycloak_public_config()["enabled"] is False


def test_keycloak_public_config_uses_browser_issuer(monkeypatch):
    monkeypatch.setenv("KEYCLOAK_ENABLED", "true")
    monkeypatch.setenv("KEYCLOAK_BASE_URL", "http://keycloak:8080")
    monkeypatch.setenv("KEYCLOAK_PUBLIC_BASE_URL", "http://localhost:8080")
    monkeypatch.setenv("KEYCLOAK_REALM", "brain")
    monkeypatch.setenv("KEYCLOAK_CLIENT_ID", "presenton")

    assert is_keycloak_configured() is True
    assert get_keycloak_public_issuer() == "http://localhost:8080/realms/brain"
    config = keycloak_public_config()
    assert config["enabled"] is True
    assert config["client_id"] == "presenton"
    assert config["authority"] == "http://localhost:8080/realms/brain"


def test_identity_prefers_email_claim():
    assert (
        identity_from_claims(
            {
                "preferred_username": "ada",
                "email": "Ada@KH7.com",
            }
        )
        == "ada@kh7.com"
    )
    assert identity_from_claims({"preferred_username": "ada"}) == "ada"
    assert identity_from_claims({}) is None


def test_normalize_sso_username_pads_short_identities():
    assert normalize_sso_username("ab", "sub-12345678") == "kc_sub12345"
    assert normalize_sso_username("ada@kh7.com") == "ada@kh7.com"
    assert len(normalize_sso_username("x" * 200)) == 128

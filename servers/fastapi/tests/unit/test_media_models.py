import asyncio

import pytest
from fastapi import HTTPException

from api.v1.ppt.endpoints import images as images_mod
from api.v1.ppt.endpoints import videos as videos_mod
from services import media_models
from services import video_generation_service as video_svc


@pytest.fixture
def gateway(monkeypatch):
    monkeypatch.setenv("IMAGE_PROVIDER", "openai_compatible")
    monkeypatch.delenv("DISABLE_IMAGE_GENERATION", raising=False)
    monkeypatch.setenv("OPENAI_COMPAT_IMAGE_MODEL", "gpt-image-1")
    monkeypatch.setenv("OPENAI_COMPAT_IMAGE_ALT_MODELS", "flux-pro, gpt-image-1,\nimagen-4,,")
    monkeypatch.setenv("OPENAI_COMPAT_VIDEO_MODEL", "atlas/kling-v2")
    monkeypatch.setenv("OPENAI_COMPAT_VIDEO_ALT_MODELS", "atlas/veo-3")


def test_lista_sin_duplicados_ni_default(gateway):
    options = media_models.image_model_options()
    assert options["default"] == "gpt-image-1"
    assert options["alternatives"] == ["flux-pro", "imagen-4"]
    assert options["models"] == ["gpt-image-1", "flux-pro", "imagen-4"]
    assert options["selectable"] is True


def test_resolver_imagen(gateway):
    assert media_models.resolve_image_model(None) is None
    assert media_models.resolve_image_model("gpt-image-1") is None
    assert media_models.resolve_image_model("flux-pro") == "flux-pro"
    with pytest.raises(ValueError, match="not enabled"):
        media_models.resolve_image_model("dall-e-2")


def test_proveedor_fijo_no_permite_elegir(gateway, monkeypatch):
    monkeypatch.setenv("IMAGE_PROVIDER", "gemini_flash")
    options = media_models.image_model_options()
    assert options["selectable"] is False
    assert options["models"] == ["gemini_flash"]
    with pytest.raises(ValueError, match="does not allow"):
        media_models.resolve_image_model("flux-pro")


def test_generate_rechaza_modelo_no_habilitado(gateway):
    with pytest.raises(HTTPException) as exc:
        asyncio.run(images_mod.generate_image(prompt="x", model="dall-e-2", sql_session=None))
    assert exc.value.status_code == 400


def test_capabilities_y_animate_validan_modelo(gateway, monkeypatch):
    caps = asyncio.run(videos_mod.video_capabilities())
    assert caps["default"] == "atlas/kling-v2"
    assert caps["models"] == ["atlas/kling-v2", "atlas/veo-3"]

    monkeypatch.setattr(videos_mod, "video_generation_configured", lambda: True)
    body = videos_mod.AnimateImageRequest(image_url="/app_data/images/a.png", model="otro")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(videos_mod.animate_image(body, background_tasks=None, sql_session=None))
    assert exc.value.status_code == 400


def test_generate_assets_acepta_omitir_el_modelo():
    from services.chat.schemas import GenerateAssetsInput

    payload = GenerateAssetsInput(assets=[{"kind": "image", "prompt": "x"}])
    assert payload.assets[0].model is None
    payload = GenerateAssetsInput(assets=[{"kind": "image", "prompt": "x", "model": "flux-pro"}])
    assert payload.assets[0].model == "flux-pro"


def test_clave_guardada_solo_para_su_gateway(monkeypatch):
    from api.v1.ppt.endpoints.openai import _resolve_saved_key

    monkeypatch.setenv("OPENAI_COMPAT_IMAGE_BASE_URL", "https://gw.local/v1/")
    monkeypatch.setenv("OPENAI_COMPAT_IMAGE_API_KEY", "sk-img")
    monkeypatch.delenv("OPENAI_COMPAT_VIDEO_BASE_URL", raising=False)
    monkeypatch.delenv("OPENAI_COMPAT_VIDEO_API_KEY", raising=False)
    assert _resolve_saved_key("https://gw.local/v1", "__configured__") == "sk-img"
    assert _resolve_saved_key("https://otro/v1", "sk-propia") == "sk-propia"
    with pytest.raises(HTTPException) as exc:
        _resolve_saved_key("https://otro/v1", "__configured__")
    assert exc.value.status_code == 400


def test_proveedor_de_video_sigue_al_modelo_elegido(gateway):
    url = video_svc._status_url("https://gw/v1/videos", "v1", "google/veo-3")
    assert "custom_llm_provider=google" in url and "model=google%2Fveo-3" in url
    assert video_svc._auth_headers("k", "google/veo-3")["custom-llm-provider"] == "google"
    assert video_svc._auth_headers("k")["custom-llm-provider"] == "atlas"

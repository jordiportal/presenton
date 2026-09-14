from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.v1.ppt.endpoints.videos import VIDEOS_ROUTER
from services import video_generation_service as video_svc


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(VIDEOS_ROUTER)
    return TestClient(app)


def test_videos_endpoint_helpers():
    assert video_svc._videos_endpoint("https://ollama.example/v1") == (
        "https://ollama.example/v1/videos"
    )
    assert video_svc._videos_endpoint("https://ollama.example/v1/videos") == (
        "https://ollama.example/v1/videos"
    )


def test_direct_video_url_detects_atlas_cdn():
    assert video_svc._is_direct_video_url(
        "https://atlas-media.oss-us-west-1.aliyuncs.com/assetd/foo/bar.mp4"
    )
    assert not video_svc._is_direct_video_url(
        "https://litellm.example/v1/videos/abc/content"
    )


def test_content_url_includes_litellm_provider(monkeypatch):
    monkeypatch.setenv("OPENAI_COMPAT_VIDEO_MODEL", "seedance-i2v")
    url = video_svc._content_url("https://litellm.example/v1/videos", "video_abc")
    assert url.startswith("https://litellm.example/v1/videos/video_abc/content?")
    assert "custom_llm_provider=openai" in url
    assert "model=seedance-i2v" in url
    headers = video_svc._auth_headers("sk-test")
    assert headers["Authorization"] == "Bearer sk-test"
    assert headers["x-litellm-api-key"] == "sk-test"
    assert headers["custom-llm-provider"] == "openai"


def test_create_video_json_includes_data_uri():
    png = (
        b"\x89PNG\r\n\x1a\n"
        + b"\x00\x00\x00\rIHDR"
        + (64).to_bytes(4, "big")
        + (32).to_bytes(4, "big")
    )
    body = video_svc._create_video_json_body(
        model="seedance-i2v",
        prompt="gentle motion",
        seconds="4",
        image_bytes=png,
        mime="image/png",
    )
    assert body["model"] == "seedance-i2v"
    assert body["input_reference"].startswith("data:image/png;base64,")
    assert body["image_url"] == body["input_reference"]
    assert body["extra_body"]["image_url"] == body["image_url"]
    assert body["size"] == "64x32"
    assert video_svc._pixel_size(png) == "64x32"
    assert video_svc._looks_like_video_bytes(b"\x00\x00\x00\x18ftypmp42")
    assert not video_svc._looks_like_video_bytes(
        b'{"error":{"message":"Incorrect API key provided: None."}}'
    )
    assert "Incorrect API key" in (
        video_svc._json_error_message(
            {
                "error": {
                    "message": "Incorrect API key provided: None.",
                    "type": "invalid_request_error",
                }
            }
        )
        or ""
    )


def test_capabilities_disabled_without_model(monkeypatch):
    monkeypatch.delenv("OPENAI_COMPAT_VIDEO_MODEL", raising=False)
    monkeypatch.delenv("OPENAI_COMPAT_IMAGE_BASE_URL", raising=False)
    monkeypatch.delenv("OPENAI_COMPAT_IMAGE_API_KEY", raising=False)
    client = _client()
    response = client.get("/videos/capabilities")
    assert response.status_code == 200
    assert response.json()["image_to_video"] is False


def test_animate_requires_configuration(monkeypatch):
    monkeypatch.setattr(video_svc, "video_generation_configured", lambda: False)
    client = _client()
    response = client.post(
        "/videos/animate",
        json={"image_url": "/app_data/images/frame.png"},
    )
    assert response.status_code == 400


def test_animate_returns_file_url(monkeypatch):
    monkeypatch.setattr(video_svc, "video_generation_configured", lambda: True)
    client = _client()
    with patch(
        "api.v1.ppt.endpoints.videos.animate_image_to_video",
        new=AsyncMock(return_value="/app_data/videos/clip.mp4"),
    ):
        response = client.post(
            "/videos/animate",
            json={
                "image_url": "/app_data/images/frame.png",
                "prompt": "gentle motion",
            },
        )
    assert response.status_code == 200
    assert response.json()["file_url"] == "/app_data/videos/clip.mp4"

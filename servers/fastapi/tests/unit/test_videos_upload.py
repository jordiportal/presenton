import io
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.v1.ppt.endpoints.videos import VIDEOS_ROUTER, _looks_like_video


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(VIDEOS_ROUTER)
    return TestClient(app)


def test_looks_like_video_accepts_mp4_ftyp():
    assert _looks_like_video(b"\x00\x00\x00\x18ftypisom", ".mp4") is True
    assert _looks_like_video(b"not-a-video", ".mp4") is False


def test_upload_video_rejects_non_video(tmp_path):
    client = _client()
    with patch(
        "api.v1.ppt.endpoints.videos.get_videos_directory",
        return_value=str(tmp_path),
    ):
        response = client.post(
            "/videos/upload",
            files={"file": ("notes.txt", io.BytesIO(b"hello"), "text/plain")},
        )
    assert response.status_code == 400


def test_upload_video_accepts_mp4(tmp_path):
    client = _client()
    payload = b"\x00\x00\x00\x18ftypisom" + b"\x00" * 32
    with patch(
        "api.v1.ppt.endpoints.videos.get_videos_directory",
        return_value=str(tmp_path),
    ):
        response = client.post(
            "/videos/upload",
            files={"file": ("clip.mp4", io.BytesIO(payload), "video/mp4")},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["file_url"].startswith("/app_data/videos/") or body[
        "file_url"
    ].startswith("http")

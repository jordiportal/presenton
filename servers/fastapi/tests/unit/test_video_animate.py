import asyncio

import pytest
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock

from api.v1.ppt.endpoints import videos as videos_mod
from api.v1.ppt.endpoints.videos import (
    ASYNC_TASK_TYPE_VIDEO_ANIMATE,
    AnimateImageRequest,
    VIDEOS_ROUTER,
    _run_animate_image_task,
    animate_image,
)
from enums.async_task_status import AsyncTaskStatus
from models.sql.async_task import AsyncTaskModel
from services import video_generation_service as video_svc


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(VIDEOS_ROUTER)
    return TestClient(app)


class _TaskSession:
    def __init__(self, task: AsyncTaskModel):
        self.task = task
        self.commit_count = 0

    async def get(self, _model, key):
        return self.task if key == self.task.id else None

    def add(self, obj) -> None:
        self.task = obj

    async def commit(self) -> None:
        self.commit_count += 1


class _SessionMaker:
    def __init__(self, session: _TaskSession):
        self.session = session

    def __call__(self):
        return self

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, *_args):
        return None


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


def test_animate_requires_configuration(monkeypatch, fake_async_session):
    monkeypatch.setattr(videos_mod, "video_generation_configured", lambda: False)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            animate_image(
                AnimateImageRequest(image_url="/app_data/images/frame.png"),
                BackgroundTasks(),
                fake_async_session,
            )
        )
    assert exc.value.status_code == 400


def test_animate_enqueues_task(monkeypatch, fake_async_session):
    monkeypatch.setattr(videos_mod, "video_generation_configured", lambda: True)
    background_tasks = BackgroundTasks()
    task = asyncio.run(
        animate_image(
            AnimateImageRequest(
                image_url="/app_data/images/frame.png",
                prompt="gentle motion",
                presentation_id="pres-1",
                slide_index=2,
                element_path="element:0:0",
            ),
            background_tasks,
            fake_async_session,
        )
    )
    assert task.type == ASYNC_TASK_TYPE_VIDEO_ANIMATE
    assert task.status == AsyncTaskStatus.PENDING
    assert task.message == "Queued for video generation"
    assert task.data["presentation_id"] == "pres-1"
    assert task.data["slide_index"] == 2
    assert "file_url" not in (task.data or {})
    assert fake_async_session.added == [task]
    assert fake_async_session.commit_count == 1
    assert len(background_tasks.tasks) == 1


def test_animate_worker_sets_file_url(monkeypatch):
    body = AnimateImageRequest(
        image_url="/app_data/images/frame.png",
        prompt="gentle motion",
        presentation_id="pres-1",
        slide_index=2,
        element_path="element:0:0",
    )
    task = AsyncTaskModel(
        id="task-video-1",
        type=ASYNC_TASK_TYPE_VIDEO_ANIMATE,
        status=AsyncTaskStatus.PENDING,
        data={"presentation_id": "pres-1"},
    )
    session = _TaskSession(task)
    monkeypatch.setattr(videos_mod, "async_session_maker", _SessionMaker(session))
    monkeypatch.setattr(
        videos_mod,
        "animate_image_to_video",
        AsyncMock(return_value="/app_data/videos/clip.mp4"),
    )

    asyncio.run(_run_animate_image_task(task.id, body))

    assert task.status == AsyncTaskStatus.COMPLETED
    assert task.message == "Video ready"
    assert task.data["file_url"] == "/app_data/videos/clip.mp4"
    assert task.data["element_path"] == "element:0:0"


def test_animate_worker_records_error(monkeypatch):
    body = AnimateImageRequest(image_url="/app_data/images/frame.png")
    task = AsyncTaskModel(
        id="task-video-err",
        type=ASYNC_TASK_TYPE_VIDEO_ANIMATE,
        status=AsyncTaskStatus.PENDING,
    )
    session = _TaskSession(task)
    monkeypatch.setattr(videos_mod, "async_session_maker", _SessionMaker(session))
    monkeypatch.setattr(
        videos_mod,
        "animate_image_to_video",
        AsyncMock(side_effect=HTTPException(status_code=502, detail="Atlas down")),
    )

    asyncio.run(_run_animate_image_task(task.id, body))

    assert task.status == AsyncTaskStatus.ERROR
    assert task.message == "Video generation failed"
    assert task.error["status_code"] == 502
    assert task.error["detail"] == "Atlas down"

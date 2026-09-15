from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from enums.async_task_status import AsyncTaskStatus
from models.api_error_model import APIErrorModel
from models.sql.async_task import AsyncTaskModel
from services.database import async_session_maker, get_async_session
from services.video_generation_service import (
    animate_image_to_video,
    get_video_model,
    video_generation_configured,
)
from utils.asset_directory_utils import (
    filesystem_video_path_to_app_data_url,
    get_videos_directory,
)
from utils.datetime_utils import get_current_utc_datetime
from utils.file_utils import get_file_name_with_random_uuid

logger = logging.getLogger(__name__)

VIDEOS_ROUTER = APIRouter(prefix="/videos", tags=["Videos"])
ASYNC_TASK_TYPE_VIDEO_ANIMATE = "video.animate"
_animate_lock = asyncio.Lock()

ALLOWED_UPLOAD_VIDEO_EXTENSIONS = {".mp4", ".m4v", ".mov", ".webm", ".ogv", ".ogg"}
MAX_UPLOAD_VIDEO_BYTES = 80 * 1024 * 1024


def _looks_like_video(content: bytes, extension: str) -> bool:
    head = content[:64]
    if extension in {".mp4", ".m4v", ".mov"}:
        return b"ftyp" in head
    if extension == ".webm":
        return head[:4] == b"\x1a\x45\xdf\xa3"
    if extension in {".ogv", ".ogg"}:
        return head[:4] == b"OggS"
    return False


async def _read_validated_video_upload(file: UploadFile) -> bytes:
    filename = file.filename or ""
    extension = os.path.splitext(filename)[1].lower()
    if extension not in ALLOWED_UPLOAD_VIDEO_EXTENSIONS:
        accepted = ", ".join(sorted(ALLOWED_UPLOAD_VIDEO_EXTENSIONS))
        raise HTTPException(
            status_code=400,
            detail=f"Invalid video file type. Accepted types: {accepted}",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded video file is empty")
    if len(content) > MAX_UPLOAD_VIDEO_BYTES:
        raise HTTPException(
            status_code=400,
            detail="Video files larger than 80 MB are not supported",
        )
    if not _looks_like_video(content, extension):
        raise HTTPException(
            status_code=400, detail="Uploaded file is not a valid video"
        )
    return content


@VIDEOS_ROUTER.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    try:
        content = await _read_validated_video_upload(file)
        new_filename = get_file_name_with_random_uuid(file)
        video_path = os.path.join(
            get_videos_directory(), os.path.basename(new_filename)
        )
        with open(video_path, "wb") as handle:
            handle.write(content)
        return {
            "path": video_path,
            "file_url": filesystem_video_path_to_app_data_url(video_path),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Failed to upload video: {str(exc)}"
        ) from exc


class AnimateImageRequest(BaseModel):
    image_url: str = Field(..., min_length=1)
    prompt: Optional[str] = None
    seconds: Optional[str] = None
    presentation_id: Optional[str] = None
    slide_index: Optional[int] = None
    element_index: Optional[int] = None
    element_path: Optional[str] = None
    poster: Optional[str] = None
    position: Optional[dict[str, Any]] = None
    size: Optional[dict[str, Any]] = None
    rotation: Optional[float] = None
    opacity: Optional[float] = None
    name: Optional[str] = None
    decorative: Optional[bool] = None


def _animate_task_data(
    body: AnimateImageRequest,
    *,
    file_url: Optional[str] = None,
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "image_url": body.image_url,
        "prompt": body.prompt,
        "seconds": body.seconds,
        "presentation_id": body.presentation_id,
        "slide_index": body.slide_index,
        "element_index": body.element_index,
        "element_path": body.element_path,
        "poster": body.poster or body.image_url,
        "position": body.position,
        "size": body.size,
        "rotation": body.rotation,
        "opacity": body.opacity,
        "name": body.name,
        "decorative": body.decorative,
    }
    if file_url:
        data["file_url"] = file_url
    return {key: value for key, value in data.items() if value is not None}


async def _update_animate_task(task_id: str, **fields: Any) -> AsyncTaskModel | None:
    async with async_session_maker() as sql_session:
        task = await sql_session.get(AsyncTaskModel, task_id)
        if not task:
            return None
        for key, value in fields.items():
            setattr(task, key, value)
        task.updated_at = get_current_utc_datetime()
        sql_session.add(task)
        await sql_session.commit()
        return task


async def _run_animate_image_task(task_id: str, body: AnimateImageRequest) -> None:
    task = await _update_animate_task(
        task_id,
        status=AsyncTaskStatus.PENDING,
        message="Generating video",
    )
    if not task:
        logger.warning("[video.animate] task missing task_id=%s", task_id)
        return

    try:
        async with _animate_lock:
            file_url = await animate_image_to_video(
                body.image_url,
                prompt=body.prompt,
                seconds=body.seconds,
            )
        await _update_animate_task(
            task_id,
            status=AsyncTaskStatus.COMPLETED,
            message="Video ready",
            data=_animate_task_data(body, file_url=file_url),
            error=None,
        )
    except Exception as exc:
        logger.exception("[video.animate] failed task_id=%s", task_id)
        http_exc = (
            exc
            if isinstance(exc, HTTPException)
            else HTTPException(
                status_code=400 if isinstance(exc, ValueError) else 502,
                detail=str(exc) or "Failed to animate image",
            )
        )
        await _update_animate_task(
            task_id,
            status=AsyncTaskStatus.ERROR,
            message="Video generation failed",
            error=APIErrorModel.from_exception(http_exc).model_dump(mode="json"),
        )


@VIDEOS_ROUTER.get("/capabilities")
async def video_capabilities() -> dict[str, object]:
    return {
        "image_to_video": video_generation_configured(),
        "model": get_video_model(),
    }


@VIDEOS_ROUTER.post(
    "/animate",
    status_code=201,
    response_model=AsyncTaskModel,
    operation_id="animate_image_async",
)
async def animate_image(
    body: AnimateImageRequest,
    background_tasks: BackgroundTasks,
    sql_session: AsyncSession = Depends(get_async_session),
):
    if not video_generation_configured():
        raise HTTPException(
            status_code=400,
            detail=(
                "Image-to-video is not configured. Set OPENAI_COMPAT_VIDEO_MODEL "
                "on the LiteLLM-compatible image provider."
            ),
        )

    task = AsyncTaskModel(
        type=ASYNC_TASK_TYPE_VIDEO_ANIMATE,
        status=AsyncTaskStatus.PENDING,
        message="Queued for video generation",
        data=_animate_task_data(body),
    )
    sql_session.add(task)
    await sql_session.commit()
    await sql_session.refresh(task)

    background_tasks.add_task(_run_animate_image_task, task.id, body)
    return task

from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from services.video_generation_service import (
    animate_image_to_video,
    get_video_model,
    video_generation_configured,
)
from utils.asset_directory_utils import (
    filesystem_video_path_to_app_data_url,
    get_videos_directory,
)
from utils.file_utils import get_file_name_with_random_uuid

logger = logging.getLogger(__name__)

VIDEOS_ROUTER = APIRouter(prefix="/videos", tags=["Videos"])

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


@VIDEOS_ROUTER.get("/capabilities")
async def video_capabilities() -> dict[str, object]:
    return {
        "image_to_video": video_generation_configured(),
        "model": get_video_model(),
    }


@VIDEOS_ROUTER.post("/animate")
async def animate_image(body: AnimateImageRequest):
    if not video_generation_configured():
        raise HTTPException(
            status_code=400,
            detail=(
                "Image-to-video is not configured. Set OPENAI_COMPAT_VIDEO_MODEL "
                "on the LiteLLM-compatible image provider."
            ),
        )
    try:
        file_url = await animate_image_to_video(
            body.image_url,
            prompt=body.prompt,
            seconds=body.seconds,
        )
        return {"file_url": file_url}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to animate image")
        raise HTTPException(
            status_code=502,
            detail=f"Failed to animate image: {str(exc)}",
        ) from exc

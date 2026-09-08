from __future__ import annotations

import os

from fastapi import APIRouter, File, HTTPException, UploadFile

from utils.asset_directory_utils import (
    filesystem_video_path_to_app_data_url,
    get_videos_directory,
)
from utils.file_utils import get_file_name_with_random_uuid

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

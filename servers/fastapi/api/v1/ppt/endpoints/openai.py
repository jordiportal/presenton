from typing import Annotated, List
from fastapi import APIRouter, Body, HTTPException

from utils.available_models import (
    ModelAvailabilityError,
    list_available_openai_compatible_models,
)
from utils.get_env import (
    get_openai_compat_image_api_key_env,
    get_openai_compat_image_base_url_env,
    get_openai_compat_video_api_key_env,
    get_openai_compat_video_base_url_env,
)

OPENAI_ROUTER = APIRouter(prefix="/openai", tags=["OpenAI"])

REDACTED_SECRET_PLACEHOLDER = "__configured__"


def _norm_url(url: str | None) -> str:
    return (url or "").strip().rstrip("/")


def _resolve_saved_key(url: str, api_key: str) -> str:
    """The browser only sees masked keys: reuse the saved one for its own gateway."""
    if api_key != REDACTED_SECRET_PLACEHOLDER:
        return api_key
    target = _norm_url(url)
    for base_url, saved_key in (
        (get_openai_compat_video_base_url_env(), get_openai_compat_video_api_key_env()),
        (get_openai_compat_image_base_url_env(), get_openai_compat_image_api_key_env()),
    ):
        if saved_key and target and target == _norm_url(base_url):
            return saved_key
    raise HTTPException(
        status_code=400,
        detail="Enter the API key: the saved one only works with its configured URL.",
    )


@OPENAI_ROUTER.post("/models/available", response_model=List[str])
async def get_available_models(
    url: Annotated[str, Body()],
    api_key: Annotated[str, Body()],
):
    api_key = _resolve_saved_key(url, api_key)
    try:
        return await list_available_openai_compatible_models(url, api_key)
    except ModelAvailabilityError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

"""Image-to-video via an OpenAI-compatible LiteLLM /v1/videos gateway."""

from __future__ import annotations

import asyncio
import base64
import json
import os
import uuid
from typing import Any, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import aiohttp

from utils.asset_directory_utils import (
    filesystem_video_path_to_app_data_url,
    get_videos_directory,
    resolve_app_path_to_filesystem,
)
from utils.get_env import (
    get_openai_compat_image_api_key_env,
    get_openai_compat_image_base_url_env,
    get_openai_compat_video_api_key_env,
    get_openai_compat_video_base_url_env,
    get_openai_compat_video_model_env,
)

DEFAULT_ANIMATE_PROMPT = (
    "Subtle natural motion, gentle camera drift, keep the same composition, "
    "photorealistic, no text overlay"
)
DEFAULT_SECONDS = "5"
POLL_INTERVAL_SECONDS = 2.0
POLL_TIMEOUT_SECONDS = 480.0
SUBMIT_TIMEOUT_SECONDS = 120.0
DEFAULT_VIDEO_PROVIDER = "openai"


def _trim(value: Optional[str]) -> str:
    return (value or "").strip()


def get_video_base_url() -> str:
    return _trim(
        get_openai_compat_video_base_url_env()
        or get_openai_compat_image_base_url_env()
    )


def get_video_api_key() -> str:
    return _trim(
        get_openai_compat_video_api_key_env()
        or get_openai_compat_image_api_key_env()
    )


def get_video_model() -> str:
    return _trim(get_openai_compat_video_model_env())


def get_video_provider() -> str:
    """LiteLLM needs the underlying provider on status/content routes."""
    model = get_video_model()
    if "/" in model:
        return model.split("/", 1)[0]
    return DEFAULT_VIDEO_PROVIDER


def video_generation_configured() -> bool:
    return bool(get_video_base_url() and get_video_api_key() and get_video_model())


def _videos_endpoint(base_url: str) -> str:
    trimmed = base_url.rstrip("/")
    if trimmed.endswith("/videos"):
        return trimmed
    return f"{trimmed}/videos"


def _auth_headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "x-litellm-api-key": api_key,
        "custom-llm-provider": get_video_provider(),
    }


def _with_provider_query(url: str) -> str:
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.setdefault("custom_llm_provider", get_video_provider())
    model = get_video_model()
    if model:
        query.setdefault("model", model)
    return urlunparse(parsed._replace(query=urlencode(query)))


def _content_url(endpoint: str, video_id: str) -> str:
    return _with_provider_query(f"{endpoint.rstrip('/')}/{video_id}/content")


def _status_url(endpoint: str, video_id: str) -> str:
    return _with_provider_query(f"{endpoint.rstrip('/')}/{video_id}")


def _pixel_size(content: bytes) -> str:
    if content.startswith(b"\x89PNG\r\n\x1a\n") and len(content) >= 24:
        width = int.from_bytes(content[16:20], "big")
        height = int.from_bytes(content[20:24], "big")
        if width > 0 and height > 0:
            return f"{width}x{height}"
    return "1024x1024"


def _to_data_uri(content: bytes, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(content).decode('ascii')}"


def _create_video_json_body(
    *,
    model: str,
    prompt: str,
    seconds: str,
    image_bytes: bytes,
    mime: str,
) -> dict[str, Any]:
    data_uri = _to_data_uri(image_bytes, mime)
    return {
        "model": model,
        "prompt": prompt,
        "seconds": seconds,
        "size": _pixel_size(image_bytes),
        "input_reference": data_uri,
        "image_url": data_uri,
        "image": data_uri,
        "generate_audio": False,
        "extra_body": {
            "image_url": data_uri,
            "image": data_uri,
            "generate_audio": False,
        },
    }


def _guess_image_mime(path: str) -> tuple[str, str]:
    ext = os.path.splitext(path)[1].lower()
    mapping = {
        ".jpg": ("image/jpeg", "jpg"),
        ".jpeg": ("image/jpeg", "jpg"),
        ".webp": ("image/webp", "webp"),
        ".gif": ("image/gif", "gif"),
        ".png": ("image/png", "png"),
    }
    mime, suffix = mapping.get(ext, ("image/png", "png"))
    return mime, suffix


async def _load_image_bytes(image_url: str) -> tuple[bytes, str, str]:
    filesystem = resolve_app_path_to_filesystem(image_url)
    if filesystem:
        with open(filesystem, "rb") as handle:
            content = handle.read()
        if not content:
            raise ValueError("Source image is empty")
        mime, suffix = _guess_image_mime(filesystem)
        return content, mime, suffix

    if image_url.startswith(("http://", "https://")):
        timeout = aiohttp.ClientTimeout(total=60)
        async with aiohttp.ClientSession(trust_env=True) as session:
            async with session.get(image_url, timeout=timeout) as response:
                if response.status != 200:
                    raise ValueError(
                        f"Could not download source image ({response.status})"
                    )
                content = await response.read()
        if not content:
            raise ValueError("Source image is empty")
        parsed = urlparse(image_url)
        mime, suffix = _guess_image_mime(parsed.path or "frame.png")
        return content, mime, suffix

    raise ValueError("Could not resolve the source image")


def _extract_video_id(payload: Any) -> Optional[str]:
    if not isinstance(payload, dict):
        return None
    nested = payload.get("data")
    if isinstance(nested, dict):
        payload = {**nested, **payload}
    video_id = payload.get("id") or payload.get("video_id")
    return str(video_id) if video_id else None


def _extract_status(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    nested = payload.get("data")
    if isinstance(nested, dict) and nested.get("status"):
        return str(nested.get("status") or "").lower()
    return str(payload.get("status") or "").lower()


def _extract_result_url(payload: Any) -> Optional[str]:
    if not isinstance(payload, dict):
        return None
    nested = payload.get("data")
    candidates: list[Any] = [payload]
    if isinstance(nested, dict):
        candidates.append(nested)
    elif isinstance(nested, list) and nested:
        candidates.append(nested[0])
    for item in candidates:
        if not isinstance(item, dict):
            continue
        for key in ("url", "video_url"):
            value = item.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        output = item.get("output") or item.get("outputs")
        if isinstance(output, str) and output.strip():
            return output.strip()
        if isinstance(output, list) and output and isinstance(output[0], str):
            return output[0]
    return None


def _looks_like_video_bytes(content: bytes) -> bool:
    head = content[:64]
    if b"ftyp" in head:
        return True
    if head[:4] == b"\x1a\x45\xdf\xa3":
        return True
    if head[:4] == b"OggS":
        return True
    return False


def _json_error_message(payload: Any) -> Optional[str]:
    if not isinstance(payload, dict):
        return None
    error = payload.get("error")
    if isinstance(error, dict):
        message = error.get("message") or error.get("code")
        if message:
            return str(message)
    if isinstance(error, str) and error.strip():
        return error.strip()
    message = payload.get("message")
    if isinstance(message, str) and message.strip() and payload.get("code"):
        return message.strip()
    return None


def _parse_json_payload(content: bytes) -> Optional[Any]:
    stripped = content.lstrip()
    if not stripped.startswith((b"{", b"[")):
        return None
    try:
        return json.loads(content)
    except Exception:
        return None


async def _read_json(response: aiohttp.ClientResponse) -> Any:
    try:
        return await response.json()
    except Exception:
        text = await response.text()
        raise RuntimeError(
            f"LiteLLM video endpoint returned non-JSON ({response.status}): {text[:400]}"
        ) from None


async def _raise_for_status(response: aiohttp.ClientResponse) -> None:
    if response.status < 400:
        return
    body = await response.text()
    raise RuntimeError(
        f"LiteLLM video generation failed ({response.status}): {body[:600]}"
    )


def _same_gateway_host(url: str, base_url: str) -> bool:
    return urlparse(url).netloc == urlparse(base_url).netloc


def _is_http_url(url: str) -> bool:
    parsed = urlparse(url.strip())
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _is_direct_video_url(url: str) -> bool:
    if not _is_http_url(url):
        return False
    parsed = urlparse(url.strip())
    path = parsed.path.lower()
    if path.endswith((".mp4", ".webm", ".mov", ".m4v")):
        return True
    if "/v1/videos" in path:
        return False
    host = parsed.netloc.lower()
    return any(
        token in host
        for token in (
            "aliyuncs.com",
            "amazonaws.com",
            "cloudfront.net",
            "atlas-media",
            "googleapis.com",
        )
    )


def _looks_like_media_url(url: str) -> bool:
    return _is_direct_video_url(url)


def _get_only_headers(headers: dict[str, str]) -> dict[str, str]:
    return {
        key: value
        for key, value in headers.items()
        if key.lower() not in {"content-type", "accept"}
    }


async def _get_bytes(
    session: aiohttp.ClientSession,
    url: str,
    headers: dict[str, str],
) -> tuple[bytes, str]:
    request_headers = {
        **_get_only_headers(headers),
        "Accept": "video/mp4,application/octet-stream,*/*",
    }
    async with session.get(url, headers=request_headers, allow_redirects=True) as response:
        await _raise_for_status(response)
        content = await response.read()
        content_type = (response.content_type or "").lower()
    if not content:
        raise RuntimeError("LiteLLM returned an empty video")
    return content, content_type


async def _coerce_video_bytes(
    session: aiohttp.ClientSession,
    content: bytes,
    content_type: str,
    headers: dict[str, str],
    base_url: str,
) -> bytes:
    if _looks_like_video_bytes(content):
        return content

    payload = _parse_json_payload(content)
    if payload is None:
        raise RuntimeError(
            "LiteLLM returned a file that is not a playable video "
            f"({content_type or 'unknown type'}, {len(content)} bytes)"
        )

    error = _json_error_message(payload)
    if error:
        raise RuntimeError(f"LiteLLM video download failed: {error}")

    result_url = _extract_result_url(payload)
    if not result_url:
        raise RuntimeError("LiteLLM video download returned JSON without a video URL")

    if result_url.startswith("/"):
        origin = f"{urlparse(base_url).scheme}://{urlparse(base_url).netloc}"
        result_url = origin + result_url

    download_headers = headers if _same_gateway_host(result_url, base_url) else {}
    nested, nested_type = await _get_bytes(session, result_url, download_headers)
    if _looks_like_video_bytes(nested):
        return nested
    nested_error = _json_error_message(_parse_json_payload(nested) or {})
    if nested_error:
        raise RuntimeError(f"LiteLLM video download failed: {nested_error}")
    raise RuntimeError(
        "LiteLLM video URL did not return a playable video "
        f"({nested_type or 'unknown type'}, {len(nested)} bytes)"
    )


async def _poll_until_ready(
    session: aiohttp.ClientSession,
    status_url: str,
    headers: dict[str, str],
) -> dict[str, Any]:
    deadline = asyncio.get_event_loop().time() + POLL_TIMEOUT_SECONDS
    last: dict[str, Any] = {}
    while asyncio.get_event_loop().time() < deadline:
        async with session.get(status_url, headers=_get_only_headers(headers)) as response:
            await _raise_for_status(response)
            payload = await _read_json(response)
        if not isinstance(payload, dict):
            raise RuntimeError("LiteLLM video status returned an unexpected payload")
        last = payload
        status = _extract_status(payload)
        if status in {"completed", "succeeded", "success"}:
            return payload
        if status in {"failed", "error", "cancelled", "canceled"}:
            detail = _json_error_message(payload) or payload.get("message") or status
            raise RuntimeError(f"LiteLLM video generation failed: {detail}")
        if _extract_result_url(payload) and _looks_like_media_url(_extract_result_url(payload) or ""):
            return payload
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
    raise RuntimeError("Timed out waiting for LiteLLM video generation")


async def animate_image_to_video(
    image_url: str,
    prompt: Optional[str] = None,
    seconds: Optional[str] = None,
) -> str:
    if not video_generation_configured():
        raise ValueError(
            "Configure OPENAI_COMPAT_VIDEO_MODEL (and the LiteLLM URL/key) "
            "to animate images."
        )

    base_url = get_video_base_url()
    api_key = get_video_api_key()
    model = get_video_model()
    prompt_text = _trim(prompt) or DEFAULT_ANIMATE_PROMPT
    duration = _trim(seconds) or DEFAULT_SECONDS
    image_bytes, mime, _suffix = await _load_image_bytes(image_url)

    endpoint = _videos_endpoint(base_url)
    headers = {
        **_auth_headers(api_key),
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    payload = _create_video_json_body(
        model=model,
        prompt=prompt_text,
        seconds=duration,
        image_bytes=image_bytes,
        mime=mime,
    )

    timeout = aiohttp.ClientTimeout(
        total=POLL_TIMEOUT_SECONDS + SUBMIT_TIMEOUT_SECONDS
    )
    async with aiohttp.ClientSession(trust_env=True, timeout=timeout) as session:
        async with session.post(endpoint, json=payload, headers=headers) as response:
            await _raise_for_status(response)
            content_type = (response.content_type or "").lower()
            if "json" not in content_type:
                video_bytes = await _coerce_video_bytes(
                    session, await response.read(), content_type, headers, base_url
                )
            else:
                payload = await _read_json(response)
                create_error = _json_error_message(payload)
                if create_error:
                    raise RuntimeError(f"LiteLLM video generation failed: {create_error}")
                status = _extract_status(payload)
                result_url = _extract_result_url(payload)
                video_id = _extract_video_id(payload)
                created_id = video_id
                if (
                    created_id
                    and status not in {"completed", "succeeded", "success"}
                    and not _is_direct_video_url(result_url or "")
                ):
                    payload = await _poll_until_ready(
                        session, _status_url(endpoint, created_id), headers
                    )
                    result_url = _extract_result_url(payload)
                    status = _extract_status(payload)

                video_bytes = None
                download_errors: list[str] = []
                if _is_direct_video_url(result_url or ""):
                    assert result_url is not None
                    download_headers = (
                        _get_only_headers(headers)
                        if _same_gateway_host(result_url, base_url)
                        else {}
                    )
                    try:
                        content, downloaded_type = await _get_bytes(
                            session, result_url, download_headers
                        )
                        video_bytes = await _coerce_video_bytes(
                            session, content, downloaded_type, headers, base_url
                        )
                    except Exception as exc:
                        download_errors.append(str(exc))
                        video_bytes = None

                if video_bytes is None and created_id:
                    try:
                        content, downloaded_type = await _get_bytes(
                            session, _content_url(endpoint, created_id), headers
                        )
                        video_bytes = await _coerce_video_bytes(
                            session, content, downloaded_type, headers, base_url
                        )
                    except Exception as exc:
                        download_errors.append(str(exc))
                        video_bytes = None

                if video_bytes is None:
                    detail = "; ".join(download_errors) or (
                        "LiteLLM video generation returned no video id or URL"
                    )
                    raise RuntimeError(detail)

    output_directory = get_videos_directory()
    os.makedirs(output_directory, exist_ok=True)
    output_path = os.path.join(output_directory, f"{uuid.uuid4()}.mp4")
    with open(output_path, "wb") as handle:
        handle.write(video_bytes)
    return filesystem_video_path_to_app_data_url(output_path)

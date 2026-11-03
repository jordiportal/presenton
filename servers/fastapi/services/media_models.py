"""Default and alternative models for image and video generation.

Only the OpenAI-compatible gateway (LiteLLM) takes a model per request; the
other image providers are a single fixed model, so nothing is selectable.
"""

from __future__ import annotations

from typing import Optional

from utils.get_env import (
    get_image_provider_env,
    get_openai_compat_image_alt_models_env,
    get_openai_compat_image_model_env,
    get_openai_compat_video_alt_models_env,
    get_openai_compat_video_model_env,
)
from utils.image_provider import (
    is_image_generation_disabled,
    is_openai_compatible_selected,
)


def parse_model_list(raw: Optional[str]) -> list[str]:
    seen: list[str] = []
    for chunk in (raw or "").replace("\n", ",").split(","):
        model = chunk.strip()
        if model and model not in seen:
            seen.append(model)
    return seen


def _options(default: str, raw_alternatives: Optional[str], selectable: bool) -> dict:
    alternatives = [m for m in parse_model_list(raw_alternatives) if m != default]
    if not selectable:
        alternatives = []
    return {
        "default": default,
        "alternatives": alternatives,
        "models": ([default] if default else []) + alternatives,
        "selectable": selectable and bool(default),
    }


def image_model_options() -> dict:
    provider = (get_image_provider_env() or "").strip()
    if is_image_generation_disabled():
        return {**_options("", None, False), "provider": provider, "enabled": False}
    if is_openai_compatible_selected():
        default = (get_openai_compat_image_model_env() or "").strip()
        return {
            **_options(default, get_openai_compat_image_alt_models_env(), True),
            "provider": provider,
            "enabled": True,
        }
    return {**_options(provider, None, False), "provider": provider, "enabled": True}


def video_model_options() -> dict:
    default = (get_openai_compat_video_model_env() or "").strip()
    return {
        **_options(default, get_openai_compat_video_alt_models_env(), True),
        "enabled": bool(default),
    }


def _resolve(requested: Optional[str], options: dict, kind: str) -> Optional[str]:
    model = (requested or "").strip()
    if not model or model == options["default"]:
        return None
    if not options["selectable"]:
        raise ValueError(f"The configured {kind} provider does not allow choosing a model.")
    if model not in options["models"]:
        allowed = ", ".join(options["models"])
        raise ValueError(f"{kind.capitalize()} model '{model}' is not enabled. Use one of: {allowed}.")
    return model


def resolve_image_model(requested: Optional[str]) -> Optional[str]:
    """Return the model to use instead of the default, or None for the default."""
    return _resolve(requested, image_model_options(), "image")


def resolve_video_model(requested: Optional[str]) -> Optional[str]:
    return _resolve(requested, video_model_options(), "video")

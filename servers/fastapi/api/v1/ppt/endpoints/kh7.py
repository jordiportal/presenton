"""Proxy to KH7 published queries so the browser never talks to KH7 directly."""

from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from api.v1.ppt.endpoints.kh7_mock import (
    execute_cube_query,
    execute_mock_query,
    get_mock_dimension_values,
    get_mock_metadata,
    list_mock_queries,
    list_mock_sources,
)
from utils.get_env import get_kh7_bi_service_key_env, get_kh7_bi_url_env

KH7_ROUTER = APIRouter(prefix="/kh7", tags=["KH7"])


def _kh7_live() -> bool:
    return bool(get_kh7_bi_url_env() and get_kh7_bi_service_key_env())


class Kh7Filter(BaseModel):
    column: str
    operator: str
    value: Any | None = None
    values: list[Any] | None = None


class Kh7ExecuteRequest(BaseModel):
    filters: list[Kh7Filter] = Field(default_factory=list)


class CubeFilter(BaseModel):
    dimension: str
    values: list[Any] = Field(default_factory=list)


class CubeExecuteRequest(BaseModel):
    source: str
    dimensions: list[str] = Field(default_factory=list)
    column_dimensions: list[str] = Field(default_factory=list)
    measures: list[str] = Field(default_factory=list)
    filters: list[CubeFilter] = Field(default_factory=list)


def _kh7_config() -> tuple[str, str]:
    base = get_kh7_bi_url_env()
    key = get_kh7_bi_service_key_env()
    if not base or not key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="KH7 not configured. Set KH7_BI_URL and KH7_BI_SERVICE_KEY.",
        )
    return base, key


def _headers(key: str) -> dict[str, str]:
    return {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-KH7-Service-Key": key,
    }


async def _forward(method: str, path: str, *, json: dict | None = None) -> Any:
    base, key = _kh7_config()
    url = f"{base}{path}"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            response = await client.request(
                method, url, headers=_headers(key), json=json
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"KH7 is unreachable: {exc}",
        ) from exc
    if response.status_code >= 400:
        detail: Any
        try:
            payload = response.json()
            detail = payload.get("detail", payload)
        except ValueError:
            detail = response.text or "KH7 request failed"
        raise HTTPException(status_code=response.status_code, detail=detail)
    if response.status_code == status.HTTP_204_NO_CONTENT:
        return None
    return response.json()


@KH7_ROUTER.get("/status")
async def kh7_status() -> dict[str, str | bool]:
    if _kh7_live():
        return {"configured": True, "source": "kh7"}
    return {"configured": True, "source": "mock"}


@KH7_ROUTER.get("/queries")
async def list_kh7_queries() -> Any:
    if not _kh7_live():
        return list_mock_queries()
    return await _forward("GET", "/api/published-queries")


@KH7_ROUTER.post("/queries/{query_id}/execute")
async def execute_kh7_query(query_id: str, payload: Kh7ExecuteRequest) -> Any:
    if not _kh7_live():
        return execute_mock_query(query_id, payload.filters)
    return await _forward(
        "POST",
        f"/api/published-queries/{query_id}/execute",
        json=payload.model_dump(),
    )


@KH7_ROUTER.get("/sources")
async def list_sources() -> Any:
    if not _kh7_live():
        return list_mock_sources()
    listed = await _forward("GET", "/api/published-queries")
    queries = listed.get("queries") or []
    return {
        "sources": [
            {
                "name": item["id"],
                "description": item.get("name") or item["id"],
                "catalog": item.get("dataset_name") or "KH7",
            }
            for item in queries
        ],
        "total": len(queries),
    }


@KH7_ROUTER.get("/metadata")
async def source_metadata(source: str) -> Any:
    if not _kh7_live():
        return get_mock_metadata(source)
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="KH7 live metadata is not wired yet. Unset KH7_BI_URL to use the mock cube.",
    )


@KH7_ROUTER.get("/dimension-values")
async def dimension_values(source: str, dimension: str) -> Any:
    if not _kh7_live():
        return {"dimension": dimension, "values": get_mock_dimension_values(source, dimension)}
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="KH7 live dimension values are not wired yet.",
    )


@KH7_ROUTER.post("/execute")
async def execute_cube(payload: CubeExecuteRequest) -> Any:
    if not _kh7_live():
        return execute_cube_query(
            payload.source,
            payload.dimensions,
            payload.measures,
            [item.model_dump() for item in payload.filters],
            payload.column_dimensions,
        )
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="KH7 live cube execute is not wired yet.",
    )

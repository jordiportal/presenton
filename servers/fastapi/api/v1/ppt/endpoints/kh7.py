"""Proxy to proxy-biw so the browser never talks to SAP BW directly."""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from api.v1.ppt.endpoints.biw_client import (
    execute_biw_cube,
    get_biw_dimension_values,
    get_biw_metadata,
    list_biw_sources,
)
from api.v1.ppt.endpoints.kh7_mock import (
    execute_cube_query,
    execute_mock_query,
    get_mock_dimension_values,
    get_mock_metadata,
    list_mock_queries,
    list_mock_sources,
)
from utils.get_env import get_proxy_biw_url_env

KH7_ROUTER = APIRouter(prefix="/kh7", tags=["KH7"])


def _biw_live() -> bool:
    return bool(get_proxy_biw_url_env())


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


def _sources_as_queries(listed: dict[str, Any]) -> dict[str, Any]:
    queries = []
    for item in listed.get("sources") or []:
        queries.append(
            {
                "id": item["name"],
                "name": item.get("description") or item["name"],
                "description": item.get("description") or item["name"],
                "dataset_id": item["name"],
                "dataset_name": item.get("catalog") or "BIW",
                "owner_id": "biw",
                "spec": {},
                "allow_filters": [],
                "shape": {},
                "is_active": True,
            }
        )
    return {"queries": queries, "total": len(queries)}


def _filters_from_kh7(extra: list[Kh7Filter]) -> list[dict[str, Any]]:
    filters: list[dict[str, Any]] = []
    for item in extra:
        dim = item.column
        values = item.values
        if not values and item.value is not None:
            values = [item.value]
        if dim and values:
            filters.append({"dimension": dim, "values": [str(value) for value in values]})
    return filters


@KH7_ROUTER.get("/status")
async def kh7_status() -> dict[str, str | bool]:
    if _biw_live():
        return {"configured": True, "source": "biw"}
    return {"configured": True, "source": "mock"}


@KH7_ROUTER.get("/queries")
async def list_kh7_queries() -> Any:
    if not _biw_live():
        return list_mock_queries()
    return _sources_as_queries(await list_biw_sources())


@KH7_ROUTER.post("/queries/{query_id}/execute")
async def execute_kh7_query(query_id: str, payload: Kh7ExecuteRequest) -> Any:
    if not _biw_live():
        return execute_mock_query(query_id, payload.filters)
    meta = await get_biw_metadata(query_id)
    first_dim = meta["dimensions"][0]["name"] if meta["dimensions"] else None
    first_measure = meta["measures"][0]["name"] if meta["measures"] else None
    return await execute_biw_cube(
        query_id,
        [first_dim] if first_dim else [],
        [first_measure] if first_measure else [],
        _filters_from_kh7(payload.filters),
        [],
    )


@KH7_ROUTER.get("/sources")
async def list_sources() -> Any:
    if not _biw_live():
        return list_mock_sources()
    return await list_biw_sources()


@KH7_ROUTER.get("/metadata")
async def source_metadata(source: str) -> Any:
    if not _biw_live():
        return get_mock_metadata(source)
    return await get_biw_metadata(source)


@KH7_ROUTER.get("/dimension-values")
async def dimension_values(source: str, dimension: str) -> Any:
    if not _biw_live():
        return {"dimension": dimension, "values": get_mock_dimension_values(source, dimension)}
    return await get_biw_dimension_values(source, dimension)


@KH7_ROUTER.post("/execute")
async def execute_cube(payload: CubeExecuteRequest) -> Any:
    if not _biw_live():
        return execute_cube_query(
            payload.source,
            payload.dimensions,
            payload.measures,
            [item.model_dump() for item in payload.filters],
            payload.column_dimensions,
        )
    return await execute_biw_cube(
        payload.source,
        payload.dimensions,
        payload.measures,
        [item.model_dump() for item in payload.filters],
        payload.column_dimensions,
    )

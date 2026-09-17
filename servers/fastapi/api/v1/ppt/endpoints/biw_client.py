from typing import Any
from urllib.parse import quote

import httpx
from fastapi import HTTPException, status

from api.v1.ppt.endpoints.cube_chart import measure_formats, to_chart
from utils.get_env import get_proxy_biw_token_env, get_proxy_biw_url_env


def _encode_path(name: str) -> str:
    return quote(name or "", safe="")


def to_proxy_filters(filters: list[dict[str, Any]] | dict[str, Any] | None) -> dict[str, Any] | None:
    if not filters:
        return None
    if not isinstance(filters, list):
        return filters
    obj: dict[str, Any] = {}
    for item in filters:
        if not item or not item.get("dimension"):
            continue
        vals = item.get("values") or []
        if not vals:
            continue
        obj[item["dimension"]] = vals[0] if len(vals) == 1 else vals
    return obj or None


def infer_initial_filters(
    dimensions: list[dict[str, Any]],
    provided: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    if provided:
        return provided
    by_name = {item["name"]: item for item in (dimensions or []) if item.get("name")}
    out: list[dict[str, Any]] = []
    if "0CALYEAR" in by_name:
        out.append(
            {
                "dimension": "0CALYEAR",
                "caption": by_name["0CALYEAR"].get("caption") or "Año natural",
                "required": True,
            }
        )
    if "0VERSION" in by_name:
        out.append(
            {
                "dimension": "0VERSION",
                "caption": by_name["0VERSION"].get("caption") or "Versión",
                "required": False,
                "defaultValues": ["#"],
            }
        )
    return out


def _real_dim_name(name: str) -> str:
    text = str(name or "")
    idx = text.find("::__L")
    return text if idx == -1 else text[:idx]


def resolve_axis_dimensions(dimensions: list[str] | None) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for name in dimensions or []:
        base = _real_dim_name(name)
        if not base or base in seen:
            continue
        seen.add(base)
        out.append(base)
    return out


def ensure_version_filter(
    filters: dict[str, Any] | None,
    meta: dict[str, Any] | None,
    dimensions: list[str] | None,
) -> dict[str, Any]:
    obj = dict(filters or {})
    version = obj.get("0VERSION")
    if version is not None and version != "":
        return obj
    has_version = any(item.get("name") == "0VERSION" for item in (meta or {}).get("dimensions") or [])
    if not has_version:
        return obj
    if dimensions and "0VERSION" in dimensions:
        return obj
    obj["0VERSION"] = "#"
    return obj


def rows_to_caption_keys(
    rows: list[dict[str, Any]] | None,
    meta: dict[str, Any] | None,
    columns: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    dim_maps: list[dict[str, str]] = []
    meas_maps: list[dict[str, str]] = []
    seen: set[str] = set()

    def add_dim(name: str | None, caption: str | None) -> None:
        if not name or f"d:{name}" in seen:
            return
        seen.add(f"d:{name}")
        dim_maps.append({"name": name, "caption": caption or name})

    def add_meas(name: str | None, caption: str | None) -> None:
        if not name or f"m:{name}" in seen:
            return
        seen.add(f"m:{name}")
        meas_maps.append({"name": name, "caption": caption or name})

    if meta:
        for item in meta.get("dimensions") or []:
            add_dim(item.get("name"), item.get("caption"))
        for item in meta.get("measures") or []:
            add_meas(item.get("name"), item.get("caption"))
    for col in columns or []:
        if not col or not col.get("name"):
            continue
        if col.get("type") == "measure":
            add_meas(col.get("name"), col.get("caption"))
        else:
            add_dim(col.get("name"), col.get("caption"))

    mapped: list[dict[str, Any]] = []
    for row in rows or []:
        out: dict[str, Any] = {}
        for dim in dim_maps:
            display = row.get(f"{dim['name']}_caption")
            if display is None or display == "":
                display = row.get(dim["name"])
            if display is None or display == "":
                display = row.get(dim["caption"])
            if (display is None or display == "") and "::__L" not in str(dim["name"]):
                display = row.get("caption")
            if display is None or display == "":
                display = row.get("code")
            if display is not None and display != "":
                out[dim["caption"]] = display
                if dim["name"] != dim["caption"]:
                    out[dim["name"]] = display
        for meas in meas_maps:
            value = row.get(meas["name"])
            if value is None:
                value = row.get(meas["caption"])
            if value is not None:
                out[meas["caption"]] = value
                if meas["name"] != meas["caption"]:
                    out[meas["name"]] = value
        mapped.append(out)
    return mapped


def _error_detail(payload: Any, text: str) -> Any:
    if isinstance(payload, dict):
        return (
            payload.get("error")
            or payload.get("details")
            or payload.get("message")
            or payload.get("detail")
            or payload
        )
    return text or "proxy-biw request failed"


async def biw_request(
    method: str,
    path: str,
    *,
    query: dict[str, Any] | None = None,
    json: dict[str, Any] | None = None,
) -> Any:
    base = get_proxy_biw_url_env()
    if not base:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="proxy-biw not configured. Set PROXY_BIW_URL.",
        )
    token = get_proxy_biw_token_env()
    url = f"{base}{path}"
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if json is not None:
        headers["Content-Type"] = "application/json"
    params = None
    if query:
        params = {key: value for key, value in query.items() if value is not None and value != ""}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
            response = await client.request(
                method, url, headers=headers, params=params or None, json=json
            )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"proxy-biw is unreachable: {exc}",
        ) from exc
    if response.status_code >= 400:
        payload: Any = None
        try:
            payload = response.json()
        except ValueError:
            payload = None
        raise HTTPException(
            status_code=response.status_code,
            detail=_error_detail(payload, response.text),
        )
    if response.status_code == status.HTTP_204_NO_CONTENT:
        return None
    return response.json()


def _map_source(item: dict[str, Any], *, short_description: bool = False) -> dict[str, Any]:
    name = item.get("name") or item.get("query_name") or ""
    short_name = name.split("/", 1)[1] if "/" in name else name
    description = item.get("description")
    if not description:
        description = short_name if short_description else name
    catalog = item.get("catalog") or (name.split("/")[0] if "/" in name else "General")
    return {
        "name": name,
        "description": description or name,
        "catalog": catalog,
        "lastUpdate": item.get("lastDataUpdate") or item.get("lastUpdate") or "",
    }


async def list_biw_sources() -> dict[str, Any]:
    short_description = False
    try:
        body = await biw_request("GET", "/api/bi/queries")
    except HTTPException:
        body = await biw_request("GET", "/api/bi/queries/allowed")
        short_description = True
    queries = [
        _map_source(item, short_description=short_description)
        for item in (body.get("queries") or [])
    ]
    return {"sources": queries, "total": len(queries)}


async def get_biw_metadata(source: str) -> dict[str, Any]:
    body = await biw_request("GET", f"/api/bi/queries/{_encode_path(source)}/metadata")
    dimensions = [
        {"name": item.get("name"), "caption": item.get("caption") or item.get("name")}
        for item in (body.get("dimensions") or [])
        if item.get("name")
    ]
    measures = [
        {
            "name": item.get("name"),
            "caption": item.get("caption") or item.get("name"),
            "dataType": item.get("dataType"),
            "unit": item.get("unit") or item.get("units"),
            "decimals": item.get("decimals"),
        }
        for item in (body.get("measures") or [])
        if item.get("name")
    ]
    return {
        "source": source,
        "dimensions": dimensions,
        "measures": measures,
        "dimensionGroups": body.get("dimensionGroups") or [],
        "initialFilters": infer_initial_filters(dimensions, body.get("initialFilters")),
    }


async def get_biw_dimension_values(source: str, dimension: str) -> dict[str, Any]:
    body = await biw_request(
        "GET",
        f"/api/bi/queries/{_encode_path(source)}/dimension-values/{_encode_path(dimension)}",
    )
    values = [
        {"code": item.get("code"), "caption": item.get("caption") or item.get("code")}
        for item in (body.get("values") or [])
        if item.get("code") is not None
    ]
    return {"dimension": dimension, "values": values}


async def execute_biw_cube(
    source: str,
    dimensions: list[str],
    measures: list[str],
    filters: list[dict[str, Any]] | None = None,
    column_dimensions: list[str] | None = None,
) -> dict[str, Any]:
    meta = await get_biw_metadata(source)
    dim_names = {item["name"] for item in meta["dimensions"]}
    measure_names = {item["name"] for item in meta["measures"]}
    row_fields = [name for name in dimensions if name in dim_names]
    col_fields = [name for name in (column_dimensions or []) if name in dim_names]
    value_fields = [name for name in measures if name in measure_names]
    if not row_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Añade al menos una dimensión al eje X",
        )
    if not value_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Añade al menos una medida a las series",
        )

    axis_dims = resolve_axis_dimensions(row_fields + col_fields)
    proxy_filters = ensure_version_filter(to_proxy_filters(filters), meta, axis_dims)
    body_payload: dict[str, Any] = {
        "query": source,
        "dimensions": axis_dims,
        "measures": value_fields,
        "options": {"maxRecords": 10000},
    }
    if proxy_filters:
        body_payload["filters"] = proxy_filters

    body = await biw_request("POST", "/api/bi/query", json=body_payload)
    rows = rows_to_caption_keys(body.get("data") or [], meta, body.get("columns") or [])
    chart = to_chart(meta, row_fields, col_fields, value_fields, rows)

    execution_time = body.get("execution_time_ms")
    if execution_time is None:
        execution_time = 0
    return {
        "query_id": source,
        "query_name": source,
        "chart": {
            "categories": chart["categories"],
            "series": chart["series"],
            "columns": chart["columns"],
            "rows": chart["rows"],
        },
        "table": chart["table"],
        "sql": body.get("mdx"),
        "execution_time_ms": execution_time,
        "source": "biw",
        "row_count": len(chart["categories"]),
        "measures": measure_formats(meta, value_fields, body.get("measures") or []),
    }

"""Proxy to an OnlyOffice Brain Bridge MCP so the browser never talks to it."""

from __future__ import annotations

import json
import re
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from utils.get_env import get_onlyoffice_mcp_url_env

ONLYOFFICE_ROUTER = APIRouter(prefix="/onlyoffice", tags=["OnlyOffice"])

_A1_SHEET_RE = re.compile(r"^(?:'([^']+)'|([^!]+))!")


class ReadRangeRequest(BaseModel):
    range: str = Field(..., min_length=1)
    sheet: str | None = None


def _mcp_base() -> str:
    base = get_onlyoffice_mcp_url_env()
    if not base:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OnlyOffice MCP is not configured. Set ONLYOFFICE_MCP_URL.",
        )
    return base


def cell_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return format(value, ".10g")
    if isinstance(value, int):
        return str(value)
    return str(value).strip()


def as_matrix(values: Any) -> list[list[str]]:
    if values is None or values == "":
        return []
    if not isinstance(values, list):
        return [[cell_text(values)]]
    if not values:
        return []
    if not isinstance(values[0], list):
        return [[cell_text(item) for item in values]]
    matrix: list[list[str]] = []
    for row in values:
        if isinstance(row, list):
            matrix.append([cell_text(item) for item in row])
        else:
            matrix.append([cell_text(row)])
    return matrix


def normalize_a1(address: str | None) -> str:
    raw = (address or "").strip()
    if not raw:
        return ""
    if "!" in raw:
        raw = raw.rsplit("!", 1)[-1]
    return raw.replace("$", "").replace("'", "").strip()


def sheet_from_address(address: str | None, fallback: str | None = None) -> str | None:
    raw = (address or "").strip()
    match = _A1_SHEET_RE.match(raw)
    if match:
        return match.group(1) or match.group(2)
    return fallback or None


def grid_from_matrix(matrix: list[list[str]]) -> dict[str, Any]:
    if not matrix:
        return {"columns": ["A"], "rows": []}
    width = max(len(row) for row in matrix)
    padded = [row + [""] * (width - len(row)) for row in matrix]
    if len(padded) == 1:
        columns = [
            cell or f"C{index + 1}" for index, cell in enumerate(padded[0])
        ]
        return {"columns": columns, "rows": []}
    columns = [
        cell or f"C{index + 1}" for index, cell in enumerate(padded[0])
    ]
    return {"columns": columns, "rows": padded[1:]}


def chart_from_grid(grid: dict[str, Any]) -> dict[str, Any]:
    columns: list[str] = list(grid.get("columns") or ["A"])
    rows: list[list[str]] = list(grid.get("rows") or [])
    if not rows:
        return {"categories": [], "series": []}
    if len(columns) == 1:
        return {
            "categories": [row[0] if row else "" for row in rows],
            "series": [
                {
                    "name": columns[0],
                    "values": [_to_number(row[0] if row else "") for row in rows],
                }
            ],
        }
    return {
        "categories": [row[0] if row else "" for row in rows],
        "series": [
            {
                "name": columns[index],
                "values": [
                    _to_number(row[index] if index < len(row) else "")
                    for row in rows
                ],
            }
            for index in range(1, len(columns))
        ],
    }


def _to_number(value: str) -> float:
    raw = (value or "").replace(" ", "").replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return 0.0


def payload_from_plugin(
    result: dict[str, Any],
    *,
    document_name: str | None = None,
    fallback_sheet: str | None = None,
    fallback_range: str | None = None,
) -> dict[str, Any]:
    error = result.get("error")
    if error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(error),
        )
    matrix = as_matrix(result.get("values"))
    if not matrix:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The OnlyOffice selection is empty.",
        )
    grid = grid_from_matrix(matrix)
    address = result.get("address") or result.get("range")
    sheet = (
        result.get("sheetName")
        or result.get("sheet")
        or sheet_from_address(str(address) if address else None, fallback_sheet)
        or fallback_sheet
        or "Sheet1"
    )
    cell_range = normalize_a1(str(address) if address else None) or (
        fallback_range or ""
    )
    query_id = f"{sheet}!{cell_range}" if cell_range else sheet
    return {
        "document_name": document_name or result.get("documentName"),
        "sheet": sheet,
        "range": cell_range,
        "query_id": query_id,
        "table": grid,
        "chart": chart_from_grid(grid),
    }


def _parse_mcp_text(text: str) -> Any:
    raw = (text or "").strip()
    if raw.startswith("Error:"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=raw[6:].strip() or raw,
        )
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"OnlyOffice MCP returned invalid JSON: {raw[:240]}",
        ) from exc


async def _mcp_health(base: str) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(8.0)) as client:
            response = await client.get(f"{base}/health")
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"OnlyOffice MCP is unreachable: {exc}",
        ) from exc
    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=response.text or "OnlyOffice MCP health failed",
        )
    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="OnlyOffice MCP health is not JSON",
        ) from exc
    return payload if isinstance(payload, dict) else {}


async def _mcp_call(name: str, arguments: dict[str, Any] | None = None) -> Any:
    base = _mcp_base()
    body = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": name, "arguments": arguments or {}},
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            response = await client.post(f"{base}/mcp", json=body)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"OnlyOffice MCP is unreachable: {exc}",
        ) from exc
    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=response.text or "OnlyOffice MCP request failed",
        )
    try:
        envelope = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="OnlyOffice MCP returned a non-JSON body",
        ) from exc
    if envelope.get("error"):
        message = envelope["error"]
        if isinstance(message, dict):
            message = message.get("message") or message
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(message),
        )
    result = envelope.get("result") or {}
    if result.get("isError"):
        chunks = result.get("content") or []
        text = chunks[0].get("text") if chunks else "OnlyOffice MCP tool failed"
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(text).removeprefix("Error:").strip() or str(text),
        )
    chunks = result.get("content") or []
    text = chunks[0].get("text") if chunks else ""
    parsed = _parse_mcp_text(str(text))
    if isinstance(parsed, dict) and parsed.get("error"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(parsed["error"]),
        )
    return parsed


def _spreadsheet_sessions(health: dict[str, Any]) -> list[dict[str, Any]]:
    sessions: list[dict[str, Any]] = []
    for editor in health.get("editors") or []:
        if not isinstance(editor, dict):
            continue
        editor_type = editor.get("type") or editor.get("editorType")
        if editor_type and editor_type != "cell":
            continue
        sessions.append(
            {
                "editor_type": editor_type or "cell",
                "document_name": editor.get("document")
                or editor.get("documentName")
                or "Libro",
            }
        )
    return sessions


@ONLYOFFICE_ROUTER.get("/status")
async def onlyoffice_status() -> dict[str, Any]:
    base = get_onlyoffice_mcp_url_env()
    if not base:
        return {"configured": False, "connected": False, "sessions": []}
    try:
        health = await _mcp_health(base)
    except HTTPException as exc:
        return {
            "configured": True,
            "connected": False,
            "sessions": [],
            "error": exc.detail,
        }
    sessions = _spreadsheet_sessions(health)
    return {
        "configured": True,
        "connected": len(sessions) > 0,
        "sessions": sessions,
    }


@ONLYOFFICE_ROUTER.post("/selection")
async def read_selection() -> dict[str, Any]:
    result = await _mcp_call("spreadsheet_read_selection")
    if not isinstance(result, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="OnlyOffice MCP returned an unexpected selection payload",
        )
    status_payload = await onlyoffice_status()
    document_name = None
    sessions = status_payload.get("sessions") or []
    if sessions:
        document_name = sessions[0].get("document_name")
    return payload_from_plugin(result, document_name=document_name)


@ONLYOFFICE_ROUTER.post("/range")
async def read_range(body: ReadRangeRequest) -> dict[str, Any]:
    arguments: dict[str, Any] = {"range": body.range.strip()}
    if body.sheet and body.sheet.strip():
        arguments["sheet"] = body.sheet.strip()
    result = await _mcp_call("spreadsheet_read_range", arguments)
    if not isinstance(result, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="OnlyOffice MCP returned an unexpected range payload",
        )
    return payload_from_plugin(
        result,
        fallback_sheet=body.sheet,
        fallback_range=body.range,
    )

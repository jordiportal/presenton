"""Sales-plan simulation API on top of the existing SQLAlchemy engine.

Workbook lives in SQL (``simulation_workbook`` / ``_row`` / ``_override``); the
slide only stores the rendered snapshot. Calculations run server-side so the
matrix, the slide visual and the ``.xlsx`` export never drift.
"""

import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from services.database import get_async_session
from services.simulation import (
    build_matrix,
    create_workbook,
    fetch_source_rows,
    get_workbook,
    load_overrides,
    replace_rows,
    set_override,
)
from services.simulation_export import build_workbook_xlsx

SIMULATION_ROUTER = APIRouter(prefix="/simulation", tags=["Simulation"])


class SimulationRefreshRequest(BaseModel):
    workbook_id: Optional[uuid.UUID] = None
    pack: str = Field(default="plan-ventas.v1")
    spec: dict[str, Any] = Field(default_factory=dict)
    presentation_id: Optional[uuid.UUID] = None
    element_name: Optional[str] = None


class SimulationOverrideRequest(BaseModel):
    row_key: str
    column_id: str
    value: Optional[float] = None


async def _require_workbook(
    session: AsyncSession, workbook_id: uuid.UUID
):
    workbook = await get_workbook(session, workbook_id)
    if workbook is None:
        raise HTTPException(status_code=404, detail="Simulation workbook not found")
    return workbook


@SIMULATION_ROUTER.post("/refresh")
async def refresh_simulation(
    payload: SimulationRefreshRequest,
    session: AsyncSession = Depends(get_async_session),
) -> dict[str, Any]:
    if payload.workbook_id is not None:
        workbook = await _require_workbook(session, payload.workbook_id)
        workbook.pack = payload.pack or workbook.pack
        workbook.spec = payload.spec or workbook.spec
        if payload.element_name is not None:
            workbook.element_name = payload.element_name
        if payload.presentation_id is not None:
            workbook.presentation_id = payload.presentation_id
        session.add(workbook)
        await session.commit()
        await session.refresh(workbook)
    else:
        workbook = await create_workbook(
            session,
            pack=payload.pack,
            spec=payload.spec,
            presentation_id=payload.presentation_id,
            element_name=payload.element_name,
        )

    rows = await fetch_source_rows(workbook.spec or {})
    await replace_rows(session, workbook, rows)
    return await build_matrix(session, workbook)


@SIMULATION_ROUTER.get("/{workbook_id}/matrix")
async def simulation_matrix(
    workbook_id: uuid.UUID,
    session: AsyncSession = Depends(get_async_session),
) -> dict[str, Any]:
    workbook = await _require_workbook(session, workbook_id)
    return await build_matrix(session, workbook)


@SIMULATION_ROUTER.post("/{workbook_id}/override")
async def simulation_override(
    workbook_id: uuid.UUID,
    payload: SimulationOverrideRequest,
    session: AsyncSession = Depends(get_async_session),
) -> dict[str, Any]:
    workbook = await _require_workbook(session, workbook_id)
    await set_override(
        session,
        workbook.id,
        payload.row_key,
        payload.column_id,
        payload.value,
    )
    return await build_matrix(session, workbook)


@SIMULATION_ROUTER.get("/{workbook_id}/export.xlsx")
async def simulation_export(
    workbook_id: uuid.UUID,
    session: AsyncSession = Depends(get_async_session),
) -> Response:
    workbook = await _require_workbook(session, workbook_id)
    matrix = await build_matrix(session, workbook)
    overrides = await load_overrides(session, workbook.id)
    content = build_workbook_xlsx(
        matrix,
        [
            {
                "row_key": item.row_key,
                "column_id": item.column_id,
                "value": item.value,
            }
            for item in overrides
        ],
        title=str(workbook.element_name or "Simulación"),
    )
    filename = f"simulacion-{workbook.id}.xlsx"
    return Response(
        content=content,
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

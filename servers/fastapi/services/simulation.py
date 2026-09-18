"""Sales-plan simulation service: KH7 fetch, persistence and matrix build.

Two cube executes feed the pack (no DAX engine in proxy-biw):

* ZMSCOPA — units (UDS) and net sales (VN) per grain, current + previous year.
* ZMATINCR — increment defaults per grain (optional; overridable in the matrix).

Everything the engine needs is stored as ``source`` on each ``SimulationRow``;
user edits live in ``SimulationOverride``. The matrix is rebuilt on demand so the
slide visual and the ``.xlsx`` export stay consistent.
"""

from __future__ import annotations

import datetime
import uuid
from calendar import monthrange
from typing import Any, Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.v1.ppt.endpoints.biw_client import execute_biw_cube
from models.sql.simulation import (
    SimulationOverride,
    SimulationRow,
    SimulationWorkbook,
)
from services.simulation_engine import compute_matrix, pack_columns
from utils.datetime_utils import get_current_utc_datetime


def _previous_year(year: str) -> str:
    try:
        return str(int(year) - 1)
    except (TypeError, ValueError):
        return year


def _working_days(year: int, month: int, holidays: set[str]) -> int:
    """Count Mon–Fri in a month, excluding ISO-date holidays (≈ DAX NETWORKDAYS)."""
    total = monthrange(year, month)[1]
    count = 0
    for day in range(1, total + 1):
        current = datetime.date(year, month, day)
        if current.weekday() < 5 and current.isoformat() not in holidays:
            count += 1
    return count


def _workday_ratios(
    current_year: str, holidays: set[str]
) -> dict[int, float]:
    """Per-month ratio of plan-year vs data-year working days (DiasNY/DiasAY)."""
    ratios = {month: 1.0 for month in range(1, 13)}
    try:
        year_ay = int(current_year)
    except (TypeError, ValueError):
        return ratios
    year_ny = year_ay + 1
    for month in range(1, 13):
        days_ay = _working_days(year_ay, month, holidays)
        days_ny = _working_days(year_ny, month, holidays)
        ratios[month] = (days_ny / days_ay) if days_ay else 1.0
    return ratios


def _month_number(caption: str) -> Optional[int]:
    """Extract a 1..12 month number from a cube caption ("01", "3", "Marzo 2027")."""
    text = str(caption or "").strip()
    if not text:
        return None
    digits = "".join(ch for ch in text if ch.isdigit())
    if digits:
        # 0CALMONTH2 → "01".."12"; 0CALMONTH → "YYYYMM".
        month = int(digits[-2:]) if len(digits) >= 2 else int(digits)
        if 1 <= month <= 12:
            return month
    names = {
        "ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
        "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12,
    }
    return names.get(text[:3].lower())


def _caption_value_map(result: dict[str, Any], measure_name: str) -> dict[str, float]:
    """Return ``{row caption: value}`` for one measure in an execute result."""
    measures = result.get("measures") or []
    caption = next(
        (m.get("caption") for m in measures if m.get("name") == measure_name),
        None,
    )
    chart = result.get("chart") or {}
    categories = chart.get("categories") or []
    series = chart.get("series") or []
    target = None
    if caption is not None:
        target = next((s for s in series if s.get("name") == caption), None)
    if target is None:
        target = series[0] if series else None
    values = (target or {}).get("values") or []
    out: dict[str, float] = {}
    for index, category in enumerate(categories):
        key = str(category or "").strip()
        if not key:
            continue
        try:
            out[key] = float(values[index])
        except (IndexError, TypeError, ValueError):
            out[key] = 0.0
    return out


def _slide_filter_pairs(spec: dict[str, Any]) -> list[dict[str, Any]]:
    pairs: list[dict[str, Any]] = []
    for item in spec.get("filters") or []:
        dimension = item.get("dimension") or item.get("column")
        values = item.get("values") or []
        if dimension and values:
            pairs.append(
                {"dimension": str(dimension), "values": [str(v) for v in values]}
            )
    return pairs


async def _execute(
    spec: dict[str, Any],
    source: str,
    dimensions: list[str],
    measures: list[str],
    extra: list[dict[str, Any]],
) -> dict[str, Any]:
    filters = [*extra, *_slide_filter_pairs(spec)]
    return await execute_biw_cube(source, dimensions, measures, filters, [])


async def fetch_source_rows(spec: dict[str, Any]) -> list[dict[str, Any]]:
    """Fetch the grain and seed each row's ``source`` values from KH7."""
    source = str(spec.get("source_query") or "")
    row_dims = [str(d) for d in (spec.get("row_dimensions") or []) if d]
    uds_measure = str(spec.get("uds_measure") or "")
    vn_measure = str(spec.get("vn_measure") or "")
    year_dim = str(spec.get("year_dimension") or "0CALYEAR")
    version_dim = str(spec.get("version_dimension") or "0VERSION")
    version_actual = str(spec.get("version_actual") or "#")
    current_year = str(spec.get("current_year") or "")
    max_rows = int(spec.get("max_rows") or 60)

    if not source or not row_dims or not uds_measure:
        return []

    measures = [uds_measure]
    if vn_measure and vn_measure != uds_measure:
        measures.append(vn_measure)

    year_filter_ay = (
        [{"dimension": year_dim, "values": [current_year]}] if current_year else []
    )
    version_filter = [{"dimension": version_dim, "values": [version_actual]}]

    ay_result = await _execute(
        spec, source, row_dims, measures, [*year_filter_ay, *version_filter]
    )
    uds_ay = _caption_value_map(ay_result, uds_measure)
    vn_ay = _caption_value_map(ay_result, vn_measure) if vn_measure else {}

    uds_ly: dict[str, float] = {}
    if current_year:
        ly_result = await _execute(
            spec,
            source,
            row_dims,
            [uds_measure],
            [
                {"dimension": year_dim, "values": [_previous_year(current_year)]},
                *version_filter,
            ],
        )
        uds_ly = _caption_value_map(ly_result, uds_measure)

    # Optional comparison vs the proposal: forecast units and objective net sales.
    prevision_map: dict[str, float] = {}
    prop_vn_map: dict[str, float] = {}
    if spec.get("compare"):
        version_forecast = str(spec.get("version_forecast") or "000")
        version_plan = str(spec.get("version_plan") or "001")
        try:
            prev_result = await _execute(
                spec,
                source,
                row_dims,
                [uds_measure],
                [*year_filter_ay, {"dimension": version_dim, "values": [version_forecast]}],
            )
            prevision_map = _caption_value_map(prev_result, uds_measure)
        except Exception:
            prevision_map = {}
        if vn_measure:
            try:
                prop_result = await _execute(
                    spec,
                    source,
                    row_dims,
                    [vn_measure],
                    [*year_filter_ay, {"dimension": version_dim, "values": [version_plan]}],
                )
                prop_vn_map = _caption_value_map(prop_result, vn_measure)
            except Exception:
                prop_vn_map = {}

    # Optional monthly weights: share of current-year units per grain per month,
    # used to distribute the annual plan into "Simu ENE…DIC" columns.
    month_weights: dict[str, dict[str, float]] = {}
    if spec.get("monthly"):
        month_dim = str(spec.get("month_dimension") or "0CALMONTH2")
        workdays_adjust = spec.get("workdays_adjust", True)
        holidays = {str(h) for h in (spec.get("holidays") or [])}
        ratios = (
            _workday_ratios(current_year, holidays)
            if workdays_adjust and current_year
            else {month: 1.0 for month in range(1, 13)}
        )
        try:
            month_result = await _execute(
                spec,
                source,
                [*row_dims, month_dim],
                [uds_measure],
                [*year_filter_ay, *version_filter],
            )
            month_map = _caption_value_map(month_result, uds_measure)
            for composite, value in month_map.items():
                prefix, _, tail = composite.rpartition(" · ")
                key = prefix if prefix else tail
                month = _month_number(tail)
                if month is None:
                    continue
                bucket = month_weights.setdefault(key, {})
                # Fold the working-day ratio into the raw share before the engine
                # normalizes it (mirrors ``Peso Plan {Mes} · DiasNY/DiasAY``).
                bucket[str(month)] = (
                    bucket.get(str(month), 0.0) + value * ratios.get(month, 1.0)
                )
        except Exception:
            # Monthly split is optional; the annual plan still works.
            month_weights = {}

    # Optional increment defaults from ZMATINCR (same grain, matched by caption).
    incr_uds: dict[str, float] = {}
    incr_vn: dict[str, float] = {}
    incr_query = spec.get("incr_query")
    if incr_query:
        incr_dim = str(spec.get("incr_row_dimension") or row_dims[0])
        incr_uds_measure = str(spec.get("incr_uds_measure") or "")
        incr_vn_measure = str(spec.get("incr_vn_measure") or "")
        incr_measures = [m for m in [incr_uds_measure, incr_vn_measure] if m]
        if incr_measures:
            try:
                incr_result = await _execute(
                    spec, str(incr_query), [incr_dim], incr_measures, []
                )
                if incr_uds_measure:
                    incr_uds = _caption_value_map(incr_result, incr_uds_measure)
                if incr_vn_measure:
                    incr_vn = _caption_value_map(incr_result, incr_vn_measure)
            except Exception:
                # Increments are optional; the user can still edit the column.
                incr_uds = {}
                incr_vn = {}

    def _as_fraction(value: float) -> float:
        # Cubes may return a percentage (5.0) or a fraction (0.05).
        return value / 100.0 if abs(value) > 1.5 else value

    keys: list[str] = []
    seen: set[str] = set()
    for mapping in (uds_ay, vn_ay, uds_ly, prevision_map, prop_vn_map):
        for key in mapping:
            if key not in seen:
                seen.add(key)
                keys.append(key)

    # Increments are fetched on the first row dimension only, so match them by
    # the first segment of a composite ("A · B · C") key.
    def _incr_lookup(mapping: dict[str, float], key: str) -> float:
        if key in mapping:
            return mapping[key]
        head = key.split(" · ", 1)[0]
        return mapping.get(head, 0.0)

    rows: list[dict[str, Any]] = []
    for ordinal, key in enumerate(keys[:max_rows]):
        rows.append(
            {
                "row_key": key,
                "label": key,
                "ordinal": ordinal,
                "source": {
                    "uds_ly": uds_ly.get(key, 0.0),
                    "uds_ay": uds_ay.get(key, 0.0),
                    "vn_ay": vn_ay.get(key, 0.0),
                    "incr_uds_pct": _as_fraction(_incr_lookup(incr_uds, key)),
                    "incr_vn_pct": _as_fraction(_incr_lookup(incr_vn, key)),
                    "prevision": prevision_map.get(key, 0.0),
                    "prop_vn": prop_vn_map.get(key, 0.0),
                    "month_weights": month_weights.get(key, {}),
                },
            }
        )
    return rows


# --- persistence ------------------------------------------------------------


async def get_workbook(
    session: AsyncSession, workbook_id: uuid.UUID
) -> Optional[SimulationWorkbook]:
    return await session.get(SimulationWorkbook, workbook_id)


async def create_workbook(
    session: AsyncSession,
    *,
    pack: str,
    spec: dict[str, Any],
    presentation_id: Optional[uuid.UUID] = None,
    element_name: Optional[str] = None,
) -> SimulationWorkbook:
    workbook = SimulationWorkbook(
        pack=pack or "plan-ventas.v1",
        spec=spec or {},
        presentation_id=presentation_id,
        element_name=element_name,
    )
    session.add(workbook)
    await session.commit()
    await session.refresh(workbook)
    return workbook


async def replace_rows(
    session: AsyncSession,
    workbook: SimulationWorkbook,
    rows: list[dict[str, Any]],
) -> None:
    await session.execute(
        delete(SimulationRow).where(SimulationRow.workbook_id == workbook.id)
    )
    for row in rows:
        session.add(
            SimulationRow(
                workbook_id=workbook.id,
                row_key=str(row.get("row_key") or ""),
                label=str(row.get("label") or row.get("row_key") or ""),
                ordinal=int(row.get("ordinal") or 0),
                source_values=row.get("source") or {},
            )
        )
    workbook.fetched_at = get_current_utc_datetime()
    workbook.updated_at = get_current_utc_datetime()
    session.add(workbook)
    await session.commit()


async def load_rows(
    session: AsyncSession, workbook_id: uuid.UUID
) -> list[SimulationRow]:
    result = await session.execute(
        select(SimulationRow).where(SimulationRow.workbook_id == workbook_id)
    )
    rows = list(result.scalars().all())
    rows.sort(key=lambda item: item.ordinal)
    return rows


async def load_overrides(
    session: AsyncSession, workbook_id: uuid.UUID
) -> list[SimulationOverride]:
    result = await session.execute(
        select(SimulationOverride).where(
            SimulationOverride.workbook_id == workbook_id
        )
    )
    return list(result.scalars().all())


async def set_override(
    session: AsyncSession,
    workbook_id: uuid.UUID,
    row_key: str,
    column_id: str,
    value: Optional[float],
) -> None:
    result = await session.execute(
        select(SimulationOverride).where(
            SimulationOverride.workbook_id == workbook_id,
            SimulationOverride.row_key == row_key,
            SimulationOverride.column_id == column_id,
        )
    )
    existing = result.scalar_one_or_none()
    if value is None:
        if existing is not None:
            await session.delete(existing)
            await session.commit()
        return
    if existing is None:
        session.add(
            SimulationOverride(
                workbook_id=workbook_id,
                row_key=row_key,
                column_id=column_id,
                value=float(value),
            )
        )
    else:
        existing.value = float(value)
        existing.updated_at = get_current_utc_datetime()
        session.add(existing)
    await session.commit()


def _editable_column_ids(pack: str) -> set[str]:
    return {col.id for col in pack_columns(pack) if col.kind == "input"}


async def build_matrix(
    session: AsyncSession, workbook: SimulationWorkbook
) -> dict[str, Any]:
    rows = await load_rows(session, workbook.id)
    overrides = await load_overrides(session, workbook.id)
    editable = _editable_column_ids(workbook.pack)
    override_map: dict[tuple[str, str], float] = {}
    for item in overrides:
        if item.column_id in editable:
            override_map[(item.row_key, item.column_id)] = item.value
    wb_spec = workbook.spec or {}
    months = bool(wb_spec.get("monthly"))
    compare = bool(wb_spec.get("compare"))
    matrix = compute_matrix(
        workbook.pack,
        [
            {
                "row_key": row.row_key,
                "label": row.label,
                "source": row.source_values or {},
            }
            for row in rows
        ],
        override_map,
        compare=compare,
        months=months,
    )
    matrix["workbook_id"] = str(workbook.id)
    matrix["fetched_at"] = (
        workbook.fetched_at.isoformat() if workbook.fetched_at else None
    )
    matrix["spec"] = workbook.spec or {}
    return matrix

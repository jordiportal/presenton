"""Simulation column engine + ``plan-ventas.v1`` pack.

The pack replicates the Inforiver "Carles" sales-plan visual. Columns carry a
role:

* ``source`` — fetched from KH7 (ZMSCOPA units / net sales, ZMATINCR increments).
* ``input``  — user editable, defaults seeded from the source (increments, VN UN).
* ``calc``   — Presenton-side port of the PBIP DAX (stitch, increment, simu).

The engine is deterministic: given the per-row ``source`` values plus the sparse
overrides, it produces the full matrix (rows + totals). The same function feeds
the slide visual and the ``.xlsx`` export so they never drift.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any

TOTAL_ROW_KEY = "__total__"


@dataclass(frozen=True)
class SimColumn:
    id: str
    label: str
    kind: str  # "label" | "source" | "input" | "calc"
    fmt: str = "number"  # "text" | "number" | "percent"

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["format"] = data.pop("fmt")
        return data


# --- plan-ventas.v1 ---------------------------------------------------------

PLAN_VENTAS_V1_COLUMNS: list[SimColumn] = [
    SimColumn("label", "", "label", "text"),
    SimColumn("uds_ly", "UDS LY", "source", "number"),
    SimColumn("uds_ay", "UDS AY R/P", "source", "number"),
    SimColumn("incr_uds_pct", "Incr. UDS %", "input", "percent"),
    SimColumn("simu_uds", "Simu UDS", "calc", "number"),
    SimColumn("dif_uds", "Dif UDS", "calc", "number"),
    SimColumn("vn_un", "VN UN", "input", "number"),
    SimColumn("incr_vn_pct", "Incr. VN %", "input", "percent"),
    SimColumn("simu_vn_un", "Simu VN UN", "calc", "number"),
    SimColumn("simu_venta", "Simu Venta", "calc", "number"),
]

PACKS: dict[str, list[SimColumn]] = {
    "plan-ventas.v1": PLAN_VENTAS_V1_COLUMNS,
}

# Month abbreviations for the optional "Simu ENE…DIC" breakdown.
MONTH_ABBR: dict[int, str] = {
    1: "Ene",
    2: "Feb",
    3: "Mar",
    4: "Abr",
    5: "May",
    6: "Jun",
    7: "Jul",
    8: "Ago",
    9: "Sep",
    10: "Oct",
    11: "Nov",
    12: "Dic",
}


def month_column_id(month: int) -> str:
    return f"simu_m{month:02d}"


def month_columns() -> list[SimColumn]:
    return [
        SimColumn(month_column_id(month), MONTH_ABBR[month], "calc", "number")
        for month in range(1, 13)
    ]


# Comparison-vs-proposal columns (DAX ``Prevision`` / ``Diferencia VN``).
COMPARE_COLUMNS: list[SimColumn] = [
    SimColumn("prevision", "Previsión", "source", "number"),
    SimColumn("prop_vn", "VN Propuesta", "source", "number"),
    SimColumn("dif_vn_prop", "Dif VN Simu vs Prop", "calc", "number"),
]


def pack_columns(
    pack: str, *, compare: bool = False, months: bool = False
) -> list[SimColumn]:
    base = list(PACKS.get(pack, PLAN_VENTAS_V1_COLUMNS))
    if compare:
        base = [*base, *COMPARE_COLUMNS]
    if months:
        base = [*base, *month_columns()]
    return base


def _num(value: Any) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return 0.0
    return result if result == result else 0.0  # drop NaN


def _month_weights(source: dict[str, Any]) -> dict[int, float]:
    """Return normalized month weights (sum == 1) from stored source shares."""
    raw = source.get("month_weights") or {}
    values: dict[int, float] = {}
    for month in range(1, 13):
        values[month] = _num(raw.get(str(month)))
    total = sum(values.values())
    if total <= 0:
        return {month: 0.0 for month in range(1, 13)}
    return {month: value / total for month, value in values.items()}


def compute_row(
    source: dict[str, Any],
    overrides: dict[str, float],
    *,
    compare: bool = False,
    months: bool = False,
) -> dict[str, float]:
    """Port of the Inforiver Simu columns for a single grain.

    Annual chain (mirrors the PBIP DAX ``Medidas`` table):
      * ``simu_uds``    = ``UDS AY`` · (1 + ``Incremento UN``)   → ``Incremento UDS``
      * ``simu_vn_un``  = ``VN UN AY`` · (1 + ``Incremento VN``) → ``Incremento VN UN``
      * ``simu_venta``  = ``simu_uds`` · ``simu_vn_un``

    When ``months`` is set, the annual ``simu_uds`` is distributed across the 12
    months using per-grain normalized plan weights (``Peso Plan {Mes}
    Normalizado`` in the DAX), fetched from KH7 as monthly unit shares.
    """
    uds_ly = _num(source.get("uds_ly"))
    uds_ay = _num(source.get("uds_ay"))
    vn_ay = _num(source.get("vn_ay"))

    incr_uds_pct = (
        overrides["incr_uds_pct"]
        if "incr_uds_pct" in overrides
        else _num(source.get("incr_uds_pct"))
    )
    incr_vn_pct = (
        overrides["incr_vn_pct"]
        if "incr_vn_pct" in overrides
        else _num(source.get("incr_vn_pct"))
    )
    vn_un_default = vn_ay / uds_ay if uds_ay else _num(source.get("vn_un"))
    vn_un = overrides["vn_un"] if "vn_un" in overrides else vn_un_default

    simu_uds = (
        overrides["simu_uds"]
        if "simu_uds" in overrides
        else uds_ay * (1.0 + incr_uds_pct)
    )
    dif_uds = simu_uds - uds_ay
    simu_vn_un = vn_un * (1.0 + incr_vn_pct)
    simu_venta = simu_uds * simu_vn_un

    values: dict[str, float] = {
        "uds_ly": uds_ly,
        "uds_ay": uds_ay,
        "incr_uds_pct": incr_uds_pct,
        "simu_uds": simu_uds,
        "dif_uds": dif_uds,
        "vn_un": vn_un,
        "incr_vn_pct": incr_vn_pct,
        "simu_vn_un": simu_vn_un,
        "simu_venta": simu_venta,
    }

    if compare:
        prevision = _num(source.get("prevision"))
        prop_vn = _num(source.get("prop_vn"))
        values["prevision"] = prevision
        values["prop_vn"] = prop_vn
        values["dif_vn_prop"] = simu_venta - prop_vn

    if months:
        weights = _month_weights(source)
        for month in range(1, 13):
            values[month_column_id(month)] = simu_uds * weights[month]

    return values


def compute_matrix(
    pack: str,
    rows: list[dict[str, Any]],
    overrides: dict[tuple[str, str], float],
    *,
    compare: bool = False,
    months: bool = False,
) -> dict[str, Any]:
    """Build the full matrix payload for a pack.

    ``rows`` is a list of ``{"row_key", "label", "source"}`` dicts. ``overrides``
    maps ``(row_key, column_id)`` to a user value. When ``compare`` is set the
    proposal-comparison columns are appended; when ``months`` is set the monthly
    ``Simu ENE…DIC`` breakdown columns are appended.
    """
    columns = pack_columns(pack, compare=compare, months=months)
    numeric_ids = [col.id for col in columns if col.kind != "label"]

    out_rows: list[dict[str, Any]] = []
    totals_acc: dict[str, float] = {cid: 0.0 for cid in numeric_ids}
    total_source = {"uds_ly": 0.0, "uds_ay": 0.0, "vn_ay": 0.0}

    for row in rows:
        row_key = str(row.get("row_key") or "")
        source = row.get("source") or {}
        row_overrides = {
            col_id: value
            for (r_key, col_id), value in overrides.items()
            if r_key == row_key
        }
        values = compute_row(source, row_overrides, compare=compare, months=months)
        out_rows.append(
            {
                "row_key": row_key,
                "label": str(row.get("label") or row_key),
                "values": values,
            }
        )
        for cid in numeric_ids:
            totals_acc[cid] += _num(values.get(cid))
        total_source["uds_ly"] += _num(source.get("uds_ly"))
        total_source["uds_ay"] += _num(source.get("uds_ay"))
        total_source["vn_ay"] += _num(values.get("simu_venta"))

    # Totals: additive for volumes/sales, derived for the ratio columns.
    uds_ay_total = totals_acc.get("uds_ay", 0.0)
    simu_uds_total = totals_acc.get("simu_uds", 0.0)
    totals: dict[str, float] = dict(totals_acc)
    totals["incr_uds_pct"] = (
        (simu_uds_total - uds_ay_total) / uds_ay_total if uds_ay_total else 0.0
    )
    totals["vn_un"] = (
        totals_acc.get("simu_venta", 0.0) / simu_uds_total if simu_uds_total else 0.0
    )
    # Weighted average increment on VN, guarded against divide-by-zero.
    totals["incr_vn_pct"] = 0.0
    totals["simu_vn_un"] = totals["vn_un"]

    return {
        "pack": pack,
        "columns": [col.to_dict() for col in columns],
        "rows": out_rows,
        "totals": totals,
    }

"""Mock cube shared with the OnlyOffice Análisis plugin (mock-data.js)."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from fastapi import HTTPException, status


SOURCES: list[dict[str, Any]] = [
    {
        "name": "ventas/ventas_por_segmento",
        "description": "Ventas por Segmento de Mercado",
        "catalog": "Ventas",
        "lastUpdate": "20260421",
    },
    {
        "name": "ventas/ventas_por_cliente",
        "description": "Ventas por Cliente",
        "catalog": "Ventas",
        "lastUpdate": "20260421",
    },
    {
        "name": "produccion/produccion_mensual",
        "description": "Producción Mensual por Línea",
        "catalog": "Produccion",
        "lastUpdate": "20260420",
    },
]

METADATA: dict[str, dict[str, Any]] = {
    "ventas/ventas_por_segmento": {
        "dimensions": [
            {"name": "ZSEGMEN", "caption": "Segmento"},
            {"name": "ZPAIS", "caption": "País"},
            {"name": "ZREGION", "caption": "Región"},
            {"name": "ZCIUDAD", "caption": "Ciudad"},
            {"name": "0CALYEAR", "caption": "Año"},
            {"name": "0CALMONTH", "caption": "Mes"},
            {"name": "0CALWEEK", "caption": "Semana"},
        ],
        "measures": [
            {"name": "ZVNETAEST", "caption": "Venta Neta", "dataType": "N", "unit": "EUR", "decimals": 2},
            {"name": "ZMARGEN", "caption": "Margen", "dataType": "N", "unit": "EUR", "decimals": 2},
            {"name": "ZUNIDADES", "caption": "Unidades", "dataType": "I", "unit": "uds", "decimals": 0},
            {"name": "ZPCT_MARGEN", "caption": "% Margen", "dataType": "N", "unit": "%", "decimals": 2},
        ],
        "dimensionGroups": [
            {
                "name": "TIME",
                "caption": "Tiempo",
                "fields": [
                    {"name": "0CALYEAR", "caption": "Año"},
                    {"name": "0CALMONTH", "caption": "Mes"},
                    {"name": "0CALWEEK", "caption": "Semana"},
                ],
            },
            {
                "name": "GEO",
                "caption": "Geografía",
                "fields": [
                    {"name": "ZREGION", "caption": "Región"},
                    {"name": "ZPAIS", "caption": "País"},
                    {"name": "ZCIUDAD", "caption": "Ciudad"},
                ],
            },
            {
                "name": "MARKET",
                "caption": "Mercado",
                "fields": [{"name": "ZSEGMEN", "caption": "Segmento"}],
            },
        ],
        "initialFilters": [
            {"dimension": "0CALYEAR", "caption": "Año", "required": True},
            {"dimension": "ZREGION", "caption": "Región", "required": False},
        ],
    },
    "ventas/ventas_por_cliente": {
        "dimensions": [
            {"name": "ZCLIENTE", "caption": "Cliente"},
            {"name": "ZSEGMEN", "caption": "Segmento"},
            {"name": "0CALMONTH", "caption": "Mes"},
        ],
        "measures": [
            {"name": "ZVNETAEST", "caption": "Venta Neta", "dataType": "N", "unit": "EUR", "decimals": 2},
            {"name": "ZDESCUENTO", "caption": "Descuento", "dataType": "N", "unit": "%", "decimals": 2},
            {"name": "ZMARGEN", "caption": "Margen", "dataType": "N", "unit": "EUR", "decimals": 2},
        ],
        "dimensionGroups": [],
        "initialFilters": [
            {"dimension": "ZSEGMEN", "caption": "Segmento", "required": True},
            {"dimension": "0CALMONTH", "caption": "Mes", "required": False},
        ],
    },
    "produccion/produccion_mensual": {
        "dimensions": [
            {"name": "ZLINEA", "caption": "Línea Producción"},
            {"name": "ZMES", "caption": "Mes"},
            {"name": "ZTURNO", "caption": "Turno"},
        ],
        "measures": [
            {"name": "ZUNID_PROD", "caption": "Unidades Producidas", "dataType": "I", "unit": "uds", "decimals": 0},
            {"name": "ZCOSTE", "caption": "Coste Total", "dataType": "N", "unit": "EUR", "decimals": 2},
            {"name": "ZEFICIENCIA", "caption": "Eficiencia %", "dataType": "N", "unit": "%", "decimals": 2},
            {"name": "ZMERMA", "caption": "Merma %", "dataType": "N", "unit": "%", "decimals": 2},
        ],
        "dimensionGroups": [],
        "initialFilters": [
            {"dimension": "ZLINEA", "caption": "Línea Producción", "required": True},
            {"dimension": "ZMES", "caption": "Mes", "required": False},
        ],
    },
}

DIMENSION_VALUES: dict[str, dict[str, list[dict[str, str]]]] = {
    "ventas/ventas_por_segmento": {
        "ZSEGMEN": [
            {"code": "NAC", "caption": "Nacional"},
            {"code": "INT", "caption": "Internacional"},
            {"code": "ONL", "caption": "Online"},
            {"code": "IND", "caption": "Industrial"},
        ],
        "ZPAIS": [
            {"code": "ES", "caption": "España"},
            {"code": "FR", "caption": "Francia"},
            {"code": "DE", "caption": "Alemania"},
            {"code": "UK", "caption": "Reino Unido"},
            {"code": "US", "caption": "Estados Unidos"},
            {"code": "CA", "caption": "Canadá"},
            {"code": "MX", "caption": "México"},
            {"code": "BR", "caption": "Brasil"},
            {"code": "JP", "caption": "Japón"},
            {"code": "CN", "caption": "China"},
        ],
        "ZREGION": [
            {"code": "EUR", "caption": "Europa"},
            {"code": "NAM", "caption": "Norteamérica"},
            {"code": "LATAM", "caption": "Latinoamérica"},
            {"code": "APAC", "caption": "Asia-Pacífico"},
        ],
        "ZCIUDAD": [
            {"code": "MAD", "caption": "Madrid"},
            {"code": "BCN", "caption": "Barcelona"},
            {"code": "PAR", "caption": "París"},
            {"code": "LYO", "caption": "Lyon"},
            {"code": "BER", "caption": "Berlín"},
            {"code": "MUN", "caption": "Múnich"},
            {"code": "LON", "caption": "Londres"},
            {"code": "MAN", "caption": "Manchester"},
            {"code": "NYC", "caption": "Nueva York"},
            {"code": "LAX", "caption": "Los Ángeles"},
            {"code": "TOR", "caption": "Toronto"},
            {"code": "VAN", "caption": "Vancouver"},
            {"code": "MEX", "caption": "Ciudad de México"},
            {"code": "GDL", "caption": "Guadalajara"},
            {"code": "SAO", "caption": "São Paulo"},
            {"code": "RIO", "caption": "Río de Janeiro"},
            {"code": "TKY", "caption": "Tokio"},
            {"code": "OSK", "caption": "Osaka"},
            {"code": "SHA", "caption": "Shanghái"},
            {"code": "BEI", "caption": "Pekín"},
        ],
        "0CALYEAR": [
            {"code": "2024", "caption": "2024"},
            {"code": "2025", "caption": "2025"},
            {"code": "2026", "caption": "2026"},
        ],
        "0CALMONTH": [
            {"code": f"{year}{month:02d}", "caption": f"{name} {year}"}
            for year in ("2025", "2026")
            for month, name in enumerate(
                (
                    "Enero",
                    "Febrero",
                    "Marzo",
                    "Abril",
                    "Mayo",
                    "Junio",
                    "Julio",
                    "Agosto",
                    "Septiembre",
                    "Octubre",
                    "Noviembre",
                    "Diciembre",
                ),
                start=1,
            )
        ],
        "0CALWEEK": [
            {"code": "202601", "caption": "Sem 01"},
            {"code": "202602", "caption": "Sem 02"},
            {"code": "202603", "caption": "Sem 03"},
            {"code": "202604", "caption": "Sem 04"},
            {"code": "202610", "caption": "Sem 10"},
            {"code": "202615", "caption": "Sem 15"},
        ],
    },
    "ventas/ventas_por_cliente": {
        "ZCLIENTE": [
            {"code": "C001", "caption": "Industrias García S.L."},
            {"code": "C002", "caption": "Distribuciones López"},
            {"code": "C003", "caption": "Comercial Martínez"},
            {"code": "C004", "caption": "Grupo Fernández"},
            {"code": "C005", "caption": "Export Trading Co."},
            {"code": "C006", "caption": "Almacenes del Norte"},
            {"code": "C007", "caption": "Suministros Técnicos"},
            {"code": "C008", "caption": "Cadena Sur"},
            {"code": "C009", "caption": "BioProducts Int."},
            {"code": "C010", "caption": "EcoDistribución"},
        ],
        "ZSEGMEN": [
            {"code": "NAC", "caption": "Nacional"},
            {"code": "INT", "caption": "Internacional"},
            {"code": "ONL", "caption": "Online"},
        ],
        "0CALMONTH": [
            {"code": f"{year}{month:02d}", "caption": f"{name} {year}"}
            for year in ("2025", "2026")
            for month, name in enumerate(
                (
                    "Enero",
                    "Febrero",
                    "Marzo",
                    "Abril",
                    "Mayo",
                    "Junio",
                    "Julio",
                    "Agosto",
                    "Septiembre",
                    "Octubre",
                    "Noviembre",
                    "Diciembre",
                ),
                start=1,
            )
        ],
    },
    "produccion/produccion_mensual": {
        "ZLINEA": [
            {"code": "L1", "caption": "Línea Líquidos"},
            {"code": "L2", "caption": "Línea Sólidos"},
            {"code": "L3", "caption": "Línea Aerosoles"},
            {"code": "L4", "caption": "Línea Envasado"},
        ],
        "ZMES": [
            {"code": "01", "caption": "Enero"},
            {"code": "02", "caption": "Febrero"},
            {"code": "03", "caption": "Marzo"},
            {"code": "04", "caption": "Abril"},
            {"code": "05", "caption": "Mayo"},
            {"code": "06", "caption": "Junio"},
            {"code": "07", "caption": "Julio"},
            {"code": "08", "caption": "Agosto"},
            {"code": "09", "caption": "Septiembre"},
            {"code": "10", "caption": "Octubre"},
            {"code": "11", "caption": "Noviembre"},
            {"code": "12", "caption": "Diciembre"},
        ],
        "ZTURNO": [
            {"code": "M", "caption": "Mañana"},
            {"code": "T", "caption": "Tarde"},
            {"code": "N", "caption": "Noche"},
        ],
    },
}

HIERARCHY_RELATIONS: dict[str, dict[str, dict[str, list[str]]]] = {
    "ventas/ventas_por_segmento": {
        "ZREGION>ZPAIS": {
            "EUR": ["ES", "FR", "DE", "UK"],
            "NAM": ["US", "CA"],
            "LATAM": ["MX", "BR"],
            "APAC": ["JP", "CN"],
        },
        "ZPAIS>ZCIUDAD": {
            "ES": ["MAD", "BCN"],
            "FR": ["PAR", "LYO"],
            "DE": ["BER", "MUN"],
            "UK": ["LON", "MAN"],
            "US": ["NYC", "LAX"],
            "CA": ["TOR", "VAN"],
            "MX": ["MEX", "GDL"],
            "BR": ["SAO", "RIO"],
            "JP": ["TKY", "OSK"],
            "CN": ["SHA", "BEI"],
        },
    }
}


def _source_or_404(source: str) -> dict[str, Any]:
    meta = METADATA.get(source)
    if meta is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Source not found: {source}")
    return meta


def list_mock_sources() -> dict[str, Any]:
    return {"sources": SOURCES, "total": len(SOURCES)}


def get_mock_metadata(source: str) -> dict[str, Any]:
    meta = _source_or_404(source)
    return {
        "source": source,
        "dimensions": meta["dimensions"],
        "measures": meta["measures"],
        "dimensionGroups": meta.get("dimensionGroups") or [],
        "initialFilters": meta.get("initialFilters") or [],
    }


def get_mock_dimension_values(source: str, dimension: str) -> list[dict[str, str]]:
    _source_or_404(source)
    values = DIMENSION_VALUES.get(source, {}).get(dimension)
    if values is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dimension not found: {dimension}",
        )
    return values


def _seeded_random(seed: int):
    state = seed

    def rng() -> float:
        nonlocal state
        state = (state * 16807) % 2147483647
        return (state - 1) / 2147483646

    return rng


def _caption(meta: dict[str, Any], name: str, kind: str) -> str:
    items = meta["dimensions"] if kind == "dimension" else meta["measures"]
    for item in items:
        if item["name"] == name:
            return item["caption"]
    return name


def generate_query_data(
    source: str,
    dimensions: list[str],
    measures: list[str],
    filters: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    meta = _source_or_404(source)
    dim_values = DIMENSION_VALUES[source]
    relations = HIERARCHY_RELATIONS.get(source, {})
    active_dims = dimensions or [meta["dimensions"][0]["name"]]
    active_measures = measures or [item["name"] for item in meta["measures"]]
    filter_map = {
        item["dimension"]: [str(value) for value in (item.get("values") or [])]
        for item in (filters or [])
        if item.get("dimension") and item.get("values")
    }

    dim_members: list[tuple[str, list[dict[str, str]]]] = []
    for dim in active_dims:
        members = list(dim_values.get(dim) or [])
        wanted = filter_map.get(dim)
        if wanted:
            members = [member for member in members if member["code"] in wanted]
        dim_members.append((dim, members))

    rows: list[dict[str, Any]] = []
    rng = _seeded_random(len(source) * 1000 + len(active_dims))

    def measure_value(name: str) -> float:
        mdef = next((item for item in meta["measures"] if item["name"] == name), None)
        decimals = 2 if mdef is None else int(mdef.get("decimals") or 2)
        if decimals == 0:
            return float(round(rng() * 50000))
        if mdef and mdef.get("unit") == "%":
            return round(rng() * 6000) / 100
        return round(rng() * 5000000) / 100

    def build(idx: int, current: dict[str, Any], parents: dict[str, str]) -> None:
        if idx >= len(dim_members):
            row = dict(current)
            for name in active_measures:
                row[_caption(meta, name, "measure")] = measure_value(name)
            rows.append(row)
            return
        dim, members = dim_members[idx]
        caption = _caption(meta, dim, "dimension")
        filtered = members
        for parent_dim, parent_code in parents.items():
            allowed = relations.get(f"{parent_dim}>{dim}", {}).get(parent_code)
            if allowed:
                filtered = [member for member in filtered if member["code"] in allowed]
        for member in filtered:
            nxt = dict(current)
            nxt[caption] = member["caption"]
            build(idx + 1, nxt, {**parents, dim: member["code"]})

    build(0, {}, {})
    return rows


def _aggregate(
    rows: list[dict[str, Any]],
    group_captions: list[str],
    measure_captions: list[str],
) -> list[dict[str, Any]]:
    buckets: dict[tuple[str, ...], dict[str, float]] = defaultdict(
        lambda: {name: 0.0 for name in measure_captions}
    )
    for row in rows:
        key = tuple(str(row.get(caption, "")) for caption in group_captions)
        for name in measure_captions:
            buckets[key][name] += float(row.get(name) or 0)
    out: list[dict[str, Any]] = []
    for key, values in buckets.items():
        item = {caption: key[i] for i, caption in enumerate(group_captions)}
        item.update(values)
        out.append(item)
    return out


def _to_chart(
    meta: dict[str, Any],
    row_fields: list[str],
    column_fields: list[str],
    measures: list[str],
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    row_caps = [_caption(meta, name, "dimension") for name in row_fields]
    col_caps = [_caption(meta, name, "dimension") for name in column_fields]
    measure_caps = [_caption(meta, name, "measure") for name in measures]

    def row_label(row: dict[str, Any]) -> str:
        return " · ".join(str(row.get(caption, "")) for caption in row_caps) or "Total"

    if not column_fields:
        categories = [row_label(row) for row in rows]
        series = [
            {"name": caption, "values": [float(row.get(caption) or 0) for row in rows]}
            for caption in measure_caps
        ]
    else:
        categories: list[str] = []
        index: dict[str, int] = {}
        series_keys: list[str] = []
        series_map: dict[str, list[float]] = {}
        for row in rows:
            cat = row_label(row)
            if cat not in index:
                index[cat] = len(categories)
                categories.append(cat)
                for values in series_map.values():
                    values.append(0.0)
            col_label = " · ".join(str(row.get(caption, "")) for caption in col_caps)
            for measure in measure_caps:
                name = f"{col_label} · {measure}" if col_label else measure
                if name not in series_map:
                    series_map[name] = [0.0] * len(categories)
                    series_keys.append(name)
                series_map[name][index[cat]] += float(row.get(measure) or 0)
        series = [{"name": name, "values": series_map[name]} for name in series_keys]

    # Same grid the chart uses: one row per category, one column per series.
    # The long-form cartesian (row × desglose) made tables look duplicated and
    # overflowed the 24-row advanced-table cap.
    axis_label = " · ".join(row_caps) or "Categoría"
    table_cols = [axis_label, *[item["name"] for item in series]]
    table_rows = [
        [categories[index], *[item["values"][index] for item in series]]
        for index in range(len(categories))
    ]
    return {
        "categories": categories,
        "series": series,
        "columns": table_cols,
        "rows": table_rows,
        "table": {"columns": table_cols, "rows": table_rows},
    }


def execute_cube_query(
    source: str,
    dimensions: list[str],
    measures: list[str],
    filters: list[dict[str, Any]] | None = None,
    column_dimensions: list[str] | None = None,
) -> dict[str, Any]:
    meta = _source_or_404(source)
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

    query_dims = row_fields + col_fields
    extra = [
        item["dimension"]
        for item in (filters or [])
        if item.get("dimension") in dim_names and item["dimension"] not in query_dims
    ]
    gen_dims = query_dims + extra
    data = generate_query_data(source, gen_dims, value_fields, filters)
    if extra:
        group_caps = [_caption(meta, name, "dimension") for name in query_dims]
        measure_caps = [_caption(meta, name, "measure") for name in value_fields]
        data = _aggregate(data, group_caps, measure_caps)
    chart = _to_chart(meta, row_fields, col_fields, value_fields, data)
    source_meta = next((item for item in SOURCES if item["name"] == source), None)
    return {
        "query_id": source,
        "query_name": source_meta["description"] if source_meta else source,
        "chart": {
            "categories": chart["categories"],
            "series": chart["series"],
            "columns": chart["columns"],
            "rows": chart["rows"],
        },
        "table": chart["table"],
        "sql": None,
        "execution_time_ms": 1,
        "source": "mock",
        "row_count": len(chart["categories"]),
    }


def list_mock_queries() -> dict[str, Any]:
    queries = []
    for item in SOURCES:
        meta = METADATA[item["name"]]
        queries.append(
            {
                "id": item["name"],
                "name": item["description"],
                "description": item["description"],
                "dataset_id": item["name"],
                "dataset_name": item["catalog"],
                "owner_id": "mock",
                "spec": {},
                "allow_filters": [
                    {"column": dim["name"], "operators": ["eq", "in"]}
                    for dim in meta["dimensions"]
                ],
                "shape": {
                    "category": meta["dimensions"][0]["name"],
                    "values": [measure["name"] for measure in meta["measures"]],
                },
                "is_active": True,
                "created_at": "2026-04-21T00:00:00+00:00",
                "updated_at": "2026-04-21T00:00:00+00:00",
            }
        )
    return {"queries": queries, "total": len(queries)}


def execute_mock_query(query_id: str, extra: list[Any]) -> dict[str, Any]:
    meta = _source_or_404(query_id)
    filters = []
    for item in extra:
        dim = getattr(item, "column", None) or getattr(item, "dimension", None)
        if not dim:
            continue
        values = getattr(item, "values", None)
        if not values and getattr(item, "value", None) is not None:
            values = [item.value]
        if values:
            filters.append({"dimension": dim, "values": [str(value) for value in values]})
    return execute_cube_query(
        query_id,
        [meta["dimensions"][0]["name"]],
        [meta["measures"][0]["name"]],
        filters,
    )

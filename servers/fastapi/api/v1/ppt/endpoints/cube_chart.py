from typing import Any, Optional


def field_caption(meta: dict[str, Any], name: str, kind: str) -> str:
    items = meta["dimensions"] if kind == "dimension" else meta["measures"]
    for item in items:
        if item["name"] == name:
            return item["caption"]
    return name


def _as_float(value: Any) -> float:
    if value is None or value == "":
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def to_chart(
    meta: dict[str, Any],
    row_fields: list[str],
    column_fields: list[str],
    measures: list[str],
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    row_caps = [field_caption(meta, name, "dimension") for name in row_fields]
    col_caps = [field_caption(meta, name, "dimension") for name in column_fields]
    measure_caps = [field_caption(meta, name, "measure") for name in measures]

    def row_label(row: dict[str, Any]) -> str:
        return " · ".join(str(row.get(caption, "")) for caption in row_caps) or "Total"

    if not column_fields:
        categories = [row_label(row) for row in rows]
        series = [
            {"name": caption, "values": [_as_float(row.get(caption)) for row in rows]}
            for caption in measure_caps
        ]
    else:
        categories = []
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
                series_map[name][index[cat]] += _as_float(row.get(measure))
        series = [{"name": name, "values": series_map[name]} for name in series_keys]

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


def measure_formats(
    meta: dict[str, Any],
    names: list[str],
    proxy_measures: Optional[list[dict[str, Any]]] = None,
) -> list[dict[str, Any]]:
    by_name = {item.get("name"): item for item in (meta.get("measures") or []) if item.get("name")}
    proxy = {
        item.get("name"): item
        for item in (proxy_measures or [])
        if item.get("name")
    }
    formats: list[dict[str, Any]] = []
    for name in names:
        item = by_name.get(name) or {}
        proxy_item = proxy.get(name) or {}
        unit = item.get("unit") or proxy_item.get("units") or proxy_item.get("unit")
        decimals = item.get("decimals")
        if decimals is None:
            decimals = proxy_item.get("decimals")
        formats.append(
            {
                "name": name,
                "caption": item.get("caption") or name,
                "dataType": item.get("dataType") or proxy_item.get("dataType"),
                "unit": unit,
                "decimals": decimals,
            }
        )
    return formats

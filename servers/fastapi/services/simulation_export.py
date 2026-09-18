"""Build the ``.xlsx`` workbook for a simulation: data sheet + overrides sheet."""

from __future__ import annotations

import io
from typing import Any

import xlsxwriter

from services.simulation_engine import TOTAL_ROW_KEY


def build_workbook_xlsx(
    matrix: dict[str, Any],
    overrides: list[dict[str, Any]],
    *,
    title: str = "Simulación",
) -> bytes:
    buffer = io.BytesIO()
    workbook = xlsxwriter.Workbook(buffer, {"in_memory": True})

    header_fmt = workbook.add_format(
        {"bold": True, "bg_color": "#F2F4F7", "border": 1, "align": "center"}
    )
    label_fmt = workbook.add_format({"border": 1})
    number_fmt = workbook.add_format({"border": 1, "num_format": "#,##0"})
    percent_fmt = workbook.add_format({"border": 1, "num_format": "0.0%"})
    total_number_fmt = workbook.add_format(
        {"border": 1, "bold": True, "num_format": "#,##0", "top": 2}
    )
    total_percent_fmt = workbook.add_format(
        {"border": 1, "bold": True, "num_format": "0.0%", "top": 2}
    )
    total_label_fmt = workbook.add_format({"border": 1, "bold": True, "top": 2})

    columns = matrix.get("columns") or []
    rows = matrix.get("rows") or []
    totals = matrix.get("totals") or {}

    sheet = workbook.add_worksheet("Datos")
    sheet.freeze_panes(1, 1)

    for col_index, column in enumerate(columns):
        label = column.get("label") or column.get("id") or ""
        sheet.write(0, col_index, str(label), header_fmt)
        sheet.set_column(col_index, col_index, 22 if col_index == 0 else 13)

    def _fmt_for(column: dict[str, Any], *, total: bool = False):
        if column.get("kind") == "label":
            return total_label_fmt if total else label_fmt
        if column.get("format") == "percent":
            return total_percent_fmt if total else percent_fmt
        return total_number_fmt if total else number_fmt

    for row_index, row in enumerate(rows, start=1):
        values = row.get("values") or {}
        for col_index, column in enumerate(columns):
            col_id = column.get("id")
            if column.get("kind") == "label":
                sheet.write(row_index, col_index, str(row.get("label") or ""), label_fmt)
            else:
                sheet.write_number(
                    row_index,
                    col_index,
                    float(values.get(col_id) or 0.0),
                    _fmt_for(column),
                )

    total_row = len(rows) + 1
    for col_index, column in enumerate(columns):
        col_id = column.get("id")
        if column.get("kind") == "label":
            sheet.write(total_row, col_index, "Total", total_label_fmt)
        else:
            sheet.write_number(
                total_row,
                col_index,
                float(totals.get(col_id) or 0.0),
                _fmt_for(column, total=True),
            )

    # Overrides sheet — the source of truth for user edits.
    ov_sheet = workbook.add_worksheet("Overrides")
    for col_index, header in enumerate(["Fila", "Columna", "Valor"]):
        ov_sheet.write(0, col_index, header, header_fmt)
    ov_sheet.set_column(0, 0, 28)
    ov_sheet.set_column(1, 1, 18)
    ov_sheet.set_column(2, 2, 14)
    for row_index, item in enumerate(overrides, start=1):
        ov_sheet.write(row_index, 0, str(item.get("row_key") or ""), label_fmt)
        ov_sheet.write(row_index, 1, str(item.get("column_id") or ""), label_fmt)
        ov_sheet.write_number(row_index, 2, float(item.get("value") or 0.0), number_fmt)

    workbook.close()
    buffer.seek(0)
    return buffer.read()


__all__ = ["build_workbook_xlsx", "TOTAL_ROW_KEY"]

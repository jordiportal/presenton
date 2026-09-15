import asyncio

from api.v1.ppt.endpoints.onlyoffice import (
    as_matrix,
    chart_from_grid,
    grid_from_matrix,
    normalize_a1,
    onlyoffice_status,
    payload_from_plugin,
    sheet_from_address,
)


def test_status_unconfigured(monkeypatch):
    monkeypatch.delenv("ONLYOFFICE_MCP_URL", raising=False)
    assert asyncio.run(onlyoffice_status()) == {
        "configured": False,
        "connected": False,
        "sessions": [],
    }


def test_normalize_a1_strips_sheet_and_dollars():
    assert normalize_a1("'$A$1:$D$4'") == "A1:D4"
    assert normalize_a1("'Ventas'!$B$2:$C$10") == "B2:C10"
    assert sheet_from_address("'Ventas'!$B$2:$C$10") == "Ventas"


def test_grid_uses_first_row_as_headers():
    grid = grid_from_matrix(
        as_matrix([["Región", "Ventas"], ["Europa", 10], ["Asia", 4.5]])
    )
    assert grid["columns"] == ["Región", "Ventas"]
    assert grid["rows"] == [["Europa", "10"], ["Asia", "4.5"]]
    chart = chart_from_grid(grid)
    assert chart["categories"] == ["Europa", "Asia"]
    assert chart["series"][0]["name"] == "Ventas"
    assert chart["series"][0]["values"] == [10.0, 4.5]


def test_payload_from_selection():
    payload = payload_from_plugin(
        {
            "address": "$A$1:$B$3",
            "sheetName": "Hoja1",
            "values": [["Mes", "Importe"], ["ene", 12], ["feb", 8]],
        },
        document_name="presupuesto.xlsx",
    )
    assert payload["sheet"] == "Hoja1"
    assert payload["range"] == "A1:B3"
    assert payload["query_id"] == "Hoja1!A1:B3"
    assert payload["document_name"] == "presupuesto.xlsx"
    assert payload["table"]["columns"] == ["Mes", "Importe"]
    assert payload["chart"]["categories"] == ["ene", "feb"]

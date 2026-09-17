import asyncio

from fastapi import HTTPException

from api.v1.ppt.endpoints.biw_client import rows_to_caption_keys, to_proxy_filters
from api.v1.ppt.endpoints.kh7 import (
    CubeExecuteRequest,
    execute_cube,
    kh7_status,
    list_sources,
    source_metadata,
)


def _unset_biw(monkeypatch):
    monkeypatch.delenv("KH7_BI_URL", raising=False)
    monkeypatch.delenv("KH7_BI_SERVICE_KEY", raising=False)
    monkeypatch.delenv("KH7_BI_TOKEN", raising=False)
    monkeypatch.delenv("PROXY_BIW_URL", raising=False)
    monkeypatch.delenv("PROXY_BIW_TOKEN", raising=False)


def test_kh7_status_falls_back_to_mock(monkeypatch):
    _unset_biw(monkeypatch)
    assert asyncio.run(kh7_status()) == {"configured": True, "source": "mock"}


def test_mock_sources_match_analisis_plugin(monkeypatch):
    _unset_biw(monkeypatch)
    listed = asyncio.run(list_sources())
    names = {item["name"] for item in listed["sources"]}
    assert names == {
        "ventas/ventas_por_segmento",
        "ventas/ventas_por_cliente",
        "produccion/produccion_mensual",
    }


def test_mock_execute_assigns_axes(monkeypatch):
    _unset_biw(monkeypatch)
    result = asyncio.run(
        execute_cube(
            CubeExecuteRequest(
                source="ventas/ventas_por_segmento",
                dimensions=["ZREGION"],
                measures=["ZVNETAEST", "ZUNIDADES"],
                filters=[],
            )
        )
    )
    assert result["source"] == "mock"
    assert result["chart"]["categories"] == [
        "Europa",
        "Norteamérica",
        "Latinoamérica",
        "Asia-Pacífico",
    ]
    assert [item["name"] for item in result["chart"]["series"]] == [
        "Venta Neta",
        "Unidades",
    ]
    assert result["table"]["columns"] == ["Región", "Venta Neta", "Unidades"]
    assert len(result["table"]["rows"]) == 4
    assert result["table"]["rows"][0][0] == "Europa"


def test_mock_table_is_pivoted_not_cartesian(monkeypatch):
    _unset_biw(monkeypatch)
    result = asyncio.run(
        execute_cube(
            CubeExecuteRequest(
                source="ventas/ventas_por_segmento",
                dimensions=["ZREGION"],
                column_dimensions=["ZSEGMEN"],
                measures=["ZVNETAEST"],
                filters=[],
            )
        )
    )
    assert result["chart"]["categories"] == [
        "Europa",
        "Norteamérica",
        "Latinoamérica",
        "Asia-Pacífico",
    ]
    assert result["table"]["columns"][0] == "Región"
    assert len(result["table"]["rows"]) == 4
    assert all(row[0] != result["table"]["columns"][0] for row in result["table"]["rows"])
    assert "Segmento" not in result["table"]["columns"]
    assert any("Nacional" in name for name in result["table"]["columns"][1:])


def test_mock_year_filter_without_year_on_axis(monkeypatch):
    _unset_biw(monkeypatch)
    result = asyncio.run(
        execute_cube(
            CubeExecuteRequest(
                source="ventas/ventas_por_segmento",
                dimensions=["ZREGION"],
                measures=["ZVNETAEST"],
                filters=[{"dimension": "0CALYEAR", "values": ["2026"]}],
            )
        )
    )
    assert result["chart"]["categories"] == [
        "Europa",
        "Norteamérica",
        "Latinoamérica",
        "Asia-Pacífico",
    ]
    assert result["row_count"] == 4


def test_mock_requires_dimension_and_measure(monkeypatch):
    _unset_biw(monkeypatch)
    try:
        asyncio.run(
            execute_cube(
                CubeExecuteRequest(
                    source="ventas/ventas_por_segmento",
                    dimensions=[],
                    measures=["ZVNETAEST"],
                )
            )
        )
    except HTTPException as exc:
        assert exc.status_code == 400
    else:
        raise AssertionError("expected 400")


def test_mock_metadata(monkeypatch):
    _unset_biw(monkeypatch)
    meta = asyncio.run(source_metadata("ventas/ventas_por_segmento"))
    assert any(item["name"] == "ZREGION" for item in meta["dimensions"])
    assert any(item["name"] == "ZVNETAEST" for item in meta["measures"])


def test_status_returns_biw_when_proxy_url_set(monkeypatch):
    _unset_biw(monkeypatch)
    monkeypatch.setenv("PROXY_BIW_URL", "http://localhost:3000")
    assert asyncio.run(kh7_status()) == {"configured": True, "source": "biw"}


def test_to_proxy_filters_collapses_single_values():
    assert to_proxy_filters([{"dimension": "ZREGION", "values": ["EUR"]}]) == {"ZREGION": "EUR"}
    assert to_proxy_filters(
        [{"dimension": "ZREGION", "values": ["EUR", "NAM"]}]
    ) == {"ZREGION": ["EUR", "NAM"]}
    assert to_proxy_filters([]) is None
    assert to_proxy_filters([{"dimension": "ZREGION", "values": []}]) is None


def test_rows_to_caption_keys_prefers_captions():
    rows = [
        {
            "ZREGION": "EUR",
            "ZREGION_caption": "Europa",
            "ZVNETAEST": 10,
        }
    ]
    meta = {
        "dimensions": [{"name": "ZREGION", "caption": "Región"}],
        "measures": [{"name": "ZVNETAEST", "caption": "Venta Neta"}],
    }
    mapped = rows_to_caption_keys(rows, meta, [])
    assert mapped[0]["Región"] == "Europa"
    assert mapped[0]["Venta Neta"] == 10
    assert mapped[0]["ZREGION"] == "Europa"


async def _fake_biw_request(method, path, *, query=None, json=None):
    if method == "GET" and path.endswith("/metadata"):
        return {
            "dimensions": [
                {"name": "ZREGION", "caption": "Región"},
                {"name": "ZSEGMEN", "caption": "Segmento"},
            ],
            "measures": [
                {"name": "ZVNETAEST", "caption": "Venta Neta", "dataType": "N", "units": "EUR"},
            ],
        }
    if method == "POST" and path == "/api/bi/query":
        return {
            "data": [
                {
                    "ZREGION": "EUR",
                    "ZREGION_caption": "Europa",
                    "Región": "Europa",
                    "ZVNETAEST": 10,
                    "Venta Neta": 10,
                },
                {
                    "ZREGION": "NAM",
                    "ZREGION_caption": "Norteamérica",
                    "Región": "Norteamérica",
                    "ZVNETAEST": 20,
                    "Venta Neta": 20,
                },
            ],
            "columns": [
                {"name": "ZREGION", "caption": "Región", "type": "dimension"},
                {"name": "ZVNETAEST", "caption": "Venta Neta", "type": "measure"},
            ],
            "mdx": "SELECT ...",
        }
    if method == "GET" and path in ("/api/bi/queries", "/api/bi/queries/allowed"):
        return {
            "queries": [
                {
                    "name": "ventas/ventas_por_segmento",
                    "description": "Ventas por Segmento",
                    "catalog": "Ventas",
                }
            ]
        }
    raise AssertionError(f"unexpected {method} {path}")


def test_biw_execute_maps_captions_to_chart(monkeypatch):
    _unset_biw(monkeypatch)
    monkeypatch.setenv("PROXY_BIW_URL", "http://localhost:3000")
    monkeypatch.setattr(
        "api.v1.ppt.endpoints.biw_client.biw_request",
        _fake_biw_request,
    )
    result = asyncio.run(
        execute_cube(
            CubeExecuteRequest(
                source="ventas/ventas_por_segmento",
                dimensions=["ZREGION"],
                measures=["ZVNETAEST"],
                filters=[],
            )
        )
    )
    assert result["source"] == "biw"
    assert result["chart"]["categories"] == ["Europa", "Norteamérica"]
    assert result["table"]["columns"][0] == "Región"
    assert result["chart"]["series"][0]["name"] == "Venta Neta"
    assert result["chart"]["series"][0]["values"] == [10.0, 20.0]
    assert result["sql"] == "SELECT ..."
    assert result["query_id"] == "ventas/ventas_por_segmento"


def test_biw_execute_requires_dimension(monkeypatch):
    _unset_biw(monkeypatch)
    monkeypatch.setenv("PROXY_BIW_URL", "http://localhost:3000")
    monkeypatch.setattr(
        "api.v1.ppt.endpoints.biw_client.biw_request",
        _fake_biw_request,
    )
    try:
        asyncio.run(
            execute_cube(
                CubeExecuteRequest(
                    source="ventas/ventas_por_segmento",
                    dimensions=[],
                    measures=["ZVNETAEST"],
                )
            )
        )
    except HTTPException as exc:
        assert exc.status_code == 400
    else:
        raise AssertionError("expected 400")

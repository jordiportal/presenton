import asyncio

from fastapi import HTTPException

from api.v1.ppt.endpoints.kh7 import (
    CubeExecuteRequest,
    execute_cube,
    kh7_status,
    list_sources,
    source_metadata,
)


def test_kh7_status_falls_back_to_mock(monkeypatch):
    monkeypatch.delenv("KH7_BI_URL", raising=False)
    monkeypatch.delenv("KH7_BI_SERVICE_KEY", raising=False)
    monkeypatch.delenv("KH7_BI_TOKEN", raising=False)
    assert asyncio.run(kh7_status()) == {"configured": True, "source": "mock"}


def test_mock_sources_match_analisis_plugin(monkeypatch):
    monkeypatch.delenv("KH7_BI_URL", raising=False)
    monkeypatch.delenv("KH7_BI_SERVICE_KEY", raising=False)
    listed = asyncio.run(list_sources())
    names = {item["name"] for item in listed["sources"]}
    assert names == {
        "ventas/ventas_por_segmento",
        "ventas/ventas_por_cliente",
        "produccion/produccion_mensual",
    }


def test_mock_execute_assigns_axes(monkeypatch):
    monkeypatch.delenv("KH7_BI_URL", raising=False)
    monkeypatch.delenv("KH7_BI_SERVICE_KEY", raising=False)
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
    monkeypatch.delenv("KH7_BI_URL", raising=False)
    monkeypatch.delenv("KH7_BI_SERVICE_KEY", raising=False)
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
    monkeypatch.delenv("KH7_BI_URL", raising=False)
    monkeypatch.delenv("KH7_BI_SERVICE_KEY", raising=False)
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
    monkeypatch.delenv("KH7_BI_URL", raising=False)
    monkeypatch.delenv("KH7_BI_SERVICE_KEY", raising=False)
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
    monkeypatch.delenv("KH7_BI_URL", raising=False)
    monkeypatch.delenv("KH7_BI_SERVICE_KEY", raising=False)
    meta = asyncio.run(source_metadata("ventas/ventas_por_segmento"))
    assert any(item["name"] == "ZREGION" for item in meta["dimensions"])
    assert any(item["name"] == "ZVNETAEST" for item in meta["measures"])

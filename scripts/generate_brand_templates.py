#!/usr/bin/env python3
"""Generate KH7 / minimal Template V2 bundles from a shared layout grid.

Run from the Presenton repo root:

    PYTHONPATH=servers/fastapi python3 scripts/generate_brand_templates.py
"""

from __future__ import annotations

import json
import struct
import sys
import zlib
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
FASTAPI = ROOT / "servers" / "fastapi"
if str(FASTAPI) not in sys.path:
    sys.path.insert(0, str(FASTAPI))

from templates.v2.models.layouts import SlideLayouts  # noqa: E402

CANVAS_W = 1280
CANVAS_H = 720
FONT = "Inter"
FONT_URL = "/vendor/fonts/sans_serif/inter/Inter[opsz,wght].ttf"


def _half_up(max_value: int) -> int:
    return (max_value + 1) // 2


# ---------------------------------------------------------------------------
# Themes
# ---------------------------------------------------------------------------

KH7 = {
    "id": "kh7",
    "name": "KH7",
    "description": (
        "Marca KH7: naranja, azul y tipografía Inter. Parrilla de layouts "
        "fijos (portada, índice, KPIs, cards, tabla, barras, cierre) para "
        "export PPTX fiel en modo standard."
    ),
    "brand": "KH7",
    "colors": {
        "primary": "#EA7C00",
        "primary_dark": "#DE4F00",
        "blue": "#212D8A",
        "green": "#178347",
        "background": "#FFFFFF",
        "background_alt": "#F5F5F5",
        "card": "#FFFFFF",
        "stroke": "#E8E8E8",
        "primary_text": "#212121",
        "background_text": "#FFFFFF",
        "muted": "#585858",
        "badge_bg": "#FFF3E6",
        "badge_text": "#EA7C00",
        "cover_bg": "#EA7C00",
        "chapter_bg": "#212D8A",
        "close_bg": "#EA7C00",
        "graph": [
            "#EA7C00",
            "#212D8A",
            "#178347",
            "#DE4F00",
            "#585858",
            "#E87500",
            "#F5F5F5",
            "#212121",
            "#9CA3AF",
            "#E8E8E8",
        ],
    },
}

MINIMAL = {
    "id": "minimal",
    "name": "Minimal",
    "description": (
        "Misma parrilla que KH7 con paleta neutra. Portada, índice, KPIs, "
        "cards, tabla, barras y cierre en modo standard."
    ),
    "brand": "",
    "colors": {
        "primary": "#111827",
        "primary_dark": "#111827",
        "blue": "#374151",
        "green": "#059669",
        "background": "#FFFFFF",
        "background_alt": "#F9FAFB",
        "card": "#FFFFFF",
        "stroke": "#E5E7EB",
        "primary_text": "#111827",
        "background_text": "#FFFFFF",
        "muted": "#6B7280",
        "badge_bg": "#F3F4F6",
        "badge_text": "#374151",
        "cover_bg": "#111827",
        "chapter_bg": "#1F2937",
        "close_bg": "#111827",
        "graph": [
            "#111827",
            "#4B5563",
            "#059669",
            "#6B7280",
            "#9CA3AF",
            "#374151",
            "#F9FAFB",
            "#111827",
            "#D1D5DB",
            "#E5E7EB",
        ],
    },
}


# ---------------------------------------------------------------------------
# Primitives
# ---------------------------------------------------------------------------

def poly(
    width: float,
    height: float,
    color: str,
    *,
    radius: float | None = None,
    shadow: dict[str, Any] | None = None,
    opacity: float | None = None,
) -> dict[str, Any]:
    fill: dict[str, Any] = {"color": color}
    if opacity is not None:
        fill["opacity"] = opacity
    element: dict[str, Any] = {
        "type": "vector",
        "shape": "polygon",
        "fill": fill,
        "points": [
            {"x": 0, "y": 0},
            {"x": width, "y": 0},
            {"x": width, "y": height},
            {"x": 0, "y": height},
        ],
        "closed": True,
    }
    if radius:
        element["corner_radii"] = [radius, radius, radius, radius]
    if shadow:
        element["shadow"] = shadow
    return element


def text(
    name: str,
    x: float,
    y: float,
    width: float,
    height: float,
    content: str,
    size: float,
    color: str,
    *,
    bold: bool = False,
    align: str = "left",
    valign: str = "top",
    max_len: int | None = None,
    decorative: bool = False,
) -> dict[str, Any]:
    max_length = max_len if max_len is not None else max(len(content), 12)
    return {
        "type": "text",
        "position": {"x": x, "y": y},
        "size": {"width": width, "height": height},
        "font": {
            "size": size,
            "family": FONT,
            "color": color,
            "bold": bold,
            "line_height": 1.15,
        },
        "alignment": {"horizontal": align, "vertical": valign},
        "runs": [{"text": content}],
        "decorative": decorative,
        "name": name,
        "max_length": max_length,
        "min_length": _half_up(max_length),
    }


def component(
    cid: str,
    description: str,
    x: float,
    y: float,
    elements: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "id": cid,
        "description": description,
        "position": {"x": x, "y": y},
        "elements": elements,
    }


def card_shadow() -> dict[str, Any]:
    return {"color": "#000000", "blur": 12, "opacity": 0.06, "offset_x": 0, "offset_y": 4}


def card(
    prefix: str,
    width: float,
    height: float,
    title: str,
    body: str,
    colors: dict[str, Any],
    *,
    accent: bool = True,
) -> dict[str, Any]:
    inner_w = width - 48
    children: list[dict[str, Any]] = []
    if accent:
        children.append(poly(40, 4, colors["primary"]))
    children.extend(
        [
            text(
                f"{prefix}_title",
                0,
                0,
                inner_w,
                40,
                title,
                22,
                colors["primary_text"],
                bold=True,
                max_len=48,
            ),
            text(
                f"{prefix}_body",
                0,
                0,
                inner_w,
                max(height - 110, 60),
                body,
                16,
                colors["muted"],
                max_len=180,
            ),
        ]
    )
    return {
        "type": "container",
        "size": {"width": width, "height": height},
        "fill": {"color": colors["card"]},
        "stroke": {"color": colors["stroke"], "width": 1},
        "border_radius": {"tl": 12, "tr": 12, "bl": 12, "br": 12},
        "shadow": card_shadow(),
        "padding": {"top": 24, "right": 24, "bottom": 24, "left": 24},
        "child": {
            "type": "flex",
            "direction": "column",
            "gap": 12,
            "name": f"{prefix}_stack",
            "min_children": len(children),
            "max_children": len(children),
            "children": children,
        },
    }


def kpi(prefix: str, width: float, height: float, value: str, label: str, colors: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "container",
        "size": {"width": width, "height": height},
        "fill": {"color": colors["card"]},
        "stroke": {"color": colors["stroke"], "width": 1},
        "border_radius": {"tl": 12, "tr": 12, "bl": 12, "br": 12},
        "shadow": card_shadow(),
        "padding": {"top": 28, "right": 24, "bottom": 24, "left": 24},
        "child": {
            "type": "flex",
            "direction": "column",
            "gap": 8,
            "name": f"{prefix}_stack",
            "min_children": 2,
            "max_children": 2,
            "children": [
                text(
                    f"{prefix}_value",
                    0,
                    0,
                    width - 48,
                    64,
                    value,
                    48,
                    colors["primary"],
                    bold=True,
                    max_len=12,
                ),
                text(
                    f"{prefix}_label",
                    0,
                    0,
                    width - 48,
                    40,
                    label,
                    16,
                    colors["muted"],
                    max_len=40,
                ),
            ],
        },
    }


def badge(name: str, label: str, colors: dict[str, Any], *, invert: bool = False) -> dict[str, Any]:
    bg = colors["primary"] if invert else colors["badge_bg"]
    fg = colors["background_text"] if invert else colors["badge_text"]
    return {
        "type": "container",
        "size": {"width": 148, "height": 36},
        "fill": {"color": bg},
        "border_radius": {"tl": 18, "tr": 18, "bl": 18, "br": 18},
        "child": text(
            name,
            0,
            0,
            148,
            36,
            label,
            13,
            fg,
            bold=True,
            align="center",
            valign="middle",
            max_len=22,
        ),
    }


def table_cell(content: str, colors: dict[str, Any], *, header: bool = False) -> dict[str, Any]:
    return {
        "color": {"color": colors["primary"] if header else colors["card"], "opacity": 1},
        "font": {
            "size": 15,
            "family": FONT,
            "color": colors["background_text"] if header else colors["primary_text"],
            "bold": header,
            "line_height": 1.2,
        },
        "alignment": "left",
        "runs": [{"text": content}],
    }


def table_el(
    name: str,
    width: float,
    height: float,
    headers: list[str],
    rows: list[list[str]],
    colors: dict[str, Any],
    *,
    max_cols: int = 5,
    max_rows: int = 8,
) -> dict[str, Any]:
    return {
        "type": "table",
        "position": {"x": 0, "y": 0},
        "size": {"width": width, "height": height},
        "columns": [table_cell(h, colors, header=True) for h in headers],
        "rows": [[table_cell(c, colors) for c in row] for row in rows],
        "decorative": False,
        "name": name,
        "min_columns": _half_up(max_cols),
        "max_columns": max_cols,
        "min_rows": _half_up(max_rows),
        "max_rows": max_rows,
    }


# ---------------------------------------------------------------------------
# Shared chrome
# ---------------------------------------------------------------------------

def background(colors: dict[str, Any], color: str | None = None) -> dict[str, Any]:
    return component(
        "background",
        "Full-slide canvas that sets the brand surface.",
        0,
        0,
        [poly(CANVAS_W, CANVAS_H, color or colors["background"])],
    )


def accent_bar(colors: dict[str, Any]) -> dict[str, Any]:
    return component(
        "accent_bar",
        "Thin brand accent strip along the top edge.",
        0,
        0,
        [poly(CANVAS_W, 8, colors["primary"])],
    )


def header(pre_title: str, title: str, colors: dict[str, Any]) -> dict[str, Any]:
    return component(
        "header",
        "Eyebrow and slide title used on content slides.",
        64,
        36,
        [
            text("pre_title", 0, 0, 1150, 28, pre_title, 16, colors["primary"], bold=True, max_len=40),
            text("title", 0, 32, 1150, 56, title, 36, colors["primary_text"], bold=True, max_len=60),
        ],
    )


# ---------------------------------------------------------------------------
# Layouts
# ---------------------------------------------------------------------------

def layout_cover(theme: dict[str, Any]) -> dict[str, Any]:
    colors = theme["colors"]
    brand = theme["brand"]
    elements: list[dict[str, Any]] = []
    if brand:
        elements.append(
            text(
                "brand_mark",
                0,
                0,
                400,
                28,
                brand,
                16,
                colors["background_text"],
                bold=True,
                max_len=20,
                decorative=True,
            )
        )
    elements.extend(
        [
        text("pre_title", 0, 80, 1000, 32, "Informe trimestral", 18, colors["background_text"], max_len=48),
        text(
            "title",
            0,
            120,
            1050,
            140,
            "Plan de medios y crecimiento",
            56,
            colors["background_text"],
            bold=True,
            max_len=72,
        ),
        text(
            "tagline",
            0,
            280,
            900,
            64,
            "Prioridades, inversión y aprendizajes del periodo.",
            22,
            colors["background_text"],
            max_len=120,
        ),
        {
            "type": "flex",
            "position": {"x": 0, "y": 380},
            "size": {"width": 700, "height": 40},
            "direction": "row",
            "gap": 12,
            "name": "badges",
            "min_children": 2,
            "max_children": 4,
            "children": [
                badge("badge_1", "Q4 2026", colors, invert=True),
                badge("badge_2", "Mercado Iberia", colors, invert=True),
                badge("badge_3", "Confidencial", colors, invert=True),
            ],
        },
        ]
    )
    return {
        "id": "cover",
        "description": "Portada de marca: pre-título, título grande, tagline y badges sobre fondo de acento.",
        "components": [
            background(colors, colors["cover_bg"]),
            component(
                "cover_shape",
                "Decorative right-side brand block.",
                980,
                0,
                [poly(300, 720, colors["primary_dark"], opacity=0.35)],
            ),
            component("cover_copy", "Cover typography stack with badges.", 80, 160, elements),
        ],
    }


def layout_toc(theme: dict[str, Any]) -> dict[str, Any]:
    colors = theme["colors"]
    titles = ["Contexto", "Inversión", "Resultados", "Próximos pasos"]
    bodies = [
        "Mercado, audiencia y objetivos del periodo.",
        "Reparto por medio, canal y geografía.",
        "KPIs, aprendizajes y comparativa.",
        "Hoja de ruta y owners de cada palanca.",
    ]
    cards = [
        card(f"toc_{i+1}", 540, 200, titles[i], bodies[i], colors)
        for i in range(4)
    ]
    return {
        "id": "toc",
        "description": "Índice o agenda en grid 2x2 de cards con título y resumen corto.",
        "components": [
            background(colors),
            accent_bar(colors),
            header("Índice", "Qué vamos a recorrer", colors),
            component(
                "toc_grid",
                "Four agenda cards in a two-by-two grid.",
                64,
                160,
                [
                    {
                        "type": "grid",
                        "size": {"width": 1152, "height": 430},
                        "columns": 2,
                        "gap": 24,
                        "name": "toc_cards",
                        "min_children": 4,
                        "max_children": 4,
                        "children": cards,
                    }
                ],
            ),
        ],
    }


def layout_chapter(theme: dict[str, Any]) -> dict[str, Any]:
    colors = theme["colors"]
    return {
        "id": "chapter",
        "description": "Separador de capítulo o país: etiqueta, título y badges sobre fondo azul o neutro.",
        "components": [
            background(colors, colors["chapter_bg"]),
            component(
                "chapter_copy",
                "Chapter label, title and context badges.",
                80,
                220,
                [
                    text("chapter_label", 0, 0, 600, 28, "Capítulo 02", 16, colors["background_text"], bold=True, max_len=32),
                    text(
                        "chapter_title",
                        0,
                        40,
                        1100,
                        100,
                        "Mercado y competencia",
                        52,
                        colors["background_text"],
                        bold=True,
                        max_len=48,
                    ),
                    {
                        "type": "flex",
                        "position": {"x": 0, "y": 160},
                        "size": {"width": 700, "height": 40},
                        "direction": "row",
                        "gap": 12,
                        "name": "chapter_badges",
                        "min_children": 2,
                        "max_children": 4,
                        "children": [
                            badge("chapter_badge_1", "Iberia", colors, invert=True),
                            badge("chapter_badge_2", "Retail", colors, invert=True),
                        ],
                    },
                ],
            ),
        ],
    }


def layout_kpis(theme: dict[str, Any]) -> dict[str, Any]:
    colors = theme["colors"]
    values = [("32%", "Notoriedad"), ("4.2x", "ROI medio"), ("18", "Medios activos"), ("€2.4M", "Inversión")]
    return {
        "id": "kpis",
        "description": "Fila de 3–4 KPIs: número hero y etiqueta. Para resultados y tableros.",
        "components": [
            background(colors, colors["background_alt"]),
            accent_bar(colors),
            header("Resultados", "Cifras que importan", colors),
            component(
                "kpi_row",
                "Four headline metric cards.",
                64,
                180,
                [
                    {
                        "type": "flex",
                        "size": {"width": 1152, "height": 240},
                        "direction": "row",
                        "gap": 24,
                        "name": "kpis",
                        "min_children": 2,
                        "max_children": 4,
                        "children": [
                            kpi(f"kpi_{i+1}", 270, 240, value, label, colors)
                            for i, (value, label) in enumerate(values)
                        ],
                    }
                ],
            ),
        ],
    }


def _cards_layout(
    layout_id: str,
    description: str,
    count: int,
    theme: dict[str, Any],
    *,
    columns: int | None = None,
) -> dict[str, Any]:
    colors = theme["colors"]
    samples = [
        ("Producto A", "Propuesta, precio y canal principal para este bloque."),
        ("Producto B", "Diferencial frente a competencia y siguiente palanca."),
        ("Producto C", "Riesgo, dependencia y owner de la iniciativa."),
        ("Producto D", "Aprendizaje del periodo y decisión pendiente."),
    ]
    cols = columns or count
    card_w = (1152 - 24 * (cols - 1)) / cols
    card_h = 380 if count <= 3 else 220
    if count == 4:
        cols = 2
        card_w = 564
        card_h = 200
    children = [
        card(f"card_{i+1}", card_w, card_h, samples[i][0], samples[i][1], colors)
        for i in range(count)
    ]
    grid_h = card_h if count <= 3 else 430
    return {
        "id": layout_id,
        "description": description,
        "components": [
            background(colors),
            accent_bar(colors),
            header("Detalle", "Puntos clave del bloque", colors),
            component(
                "cards",
                f"Grid of {count} content cards.",
                64,
                160,
                [
                    {
                        "type": "grid",
                        "size": {"width": 1152, "height": grid_h},
                        "columns": cols,
                        "gap": 24,
                        "name": "content_cards",
                        "min_children": count,
                        "max_children": count,
                        "children": children,
                    }
                ],
            ),
        ],
    }


def layout_table(theme: dict[str, Any]) -> dict[str, Any]:
    colors = theme["colors"]
    headers = ["Medio", "Inversión", "Alcance", "CPA"]
    rows = [
        ["TV nacional", "€820k", "12.4M", "€4.10"],
        ["Digital video", "€610k", "8.1M", "€3.40"],
        ["Retail media", "€410k", "3.6M", "€2.80"],
        ["OOH selectivo", "€180k", "2.1M", "€5.20"],
    ]
    return {
        "id": "table",
        "description": "Comparativa en tabla nativa (medios, competencia, mix). No uses HTML.",
        "components": [
            background(colors),
            accent_bar(colors),
            header("Comparativa", "Inversión y rendimiento por medio", colors),
            component(
                "table_block",
                "Native comparison table.",
                64,
                160,
                [table_el("comparison_table", 1152, 460, headers, rows, colors)],
            ),
        ],
    }


def layout_table_stats(theme: dict[str, Any]) -> dict[str, Any]:
    colors = theme["colors"]
    headers = ["Segmento", "Población", "Peso", "Crecimiento"]
    rows = [
        ["18–34", "9.8M", "28%", "+1.2%"],
        ["35–54", "12.1M", "35%", "+0.4%"],
        ["55+", "12.6M", "37%", "+2.1%"],
    ]
    stats = [("34.6M", "Universo"), ("+1.1%", "YoY"), ("3", "Cohortes")]
    return {
        "id": "table_stats",
        "description": "Tabla nativa más fila de 3 stats. Típico de demografía o mix.",
        "components": [
            background(colors, colors["background_alt"]),
            accent_bar(colors),
            header("Población", "Universo y crecimiento por cohorte", colors),
            component(
                "table_block",
                "Demographic comparison table.",
                64,
                150,
                [table_el("population_table", 1152, 300, headers, rows, colors, max_rows=6)],
            ),
            component(
                "stats_row",
                "Three supporting headline stats under the table.",
                64,
                480,
                [
                    {
                        "type": "flex",
                        "size": {"width": 1152, "height": 180},
                        "direction": "row",
                        "gap": 24,
                        "name": "support_stats",
                        "min_children": 2,
                        "max_children": 3,
                        "children": [
                            kpi(f"stat_{i+1}", 368, 180, value, label, colors)
                            for i, (value, label) in enumerate(stats)
                        ],
                    }
                ],
            ),
        ],
    }


def layout_bar_chart(theme: dict[str, Any]) -> dict[str, Any]:
    colors = theme["colors"]
    return {
        "id": "bar_chart",
        "description": "Gráfico de barras nativo (no SVG suelto) con título y nota.",
        "components": [
            background(colors),
            accent_bar(colors),
            header("Evolución", "Inversión trimestral por canal", colors),
            component(
                "chart_block",
                "Native bar chart for channel investment.",
                64,
                150,
                [
                    {
                        "type": "chart",
                        "size": {"width": 1152, "height": 420},
                        "chart_type": "bar",
                        "colors": colors["graph"][:3],
                        "x_axis": True,
                        "y_axis": True,
                        "axis_color": "#9CA3AF",
                        "categories": ["Q1", "Q2", "Q3", "Q4"],
                        "series": [
                            {"name": "Digital", "values": [42, 55, 61, 70]},
                            {"name": "Tradicional", "values": [38, 33, 29, 24]},
                        ],
                        "data_labels": "top",
                        "legend": True,
                        "x_axis_grid": False,
                        "y_axis_grid": True,
                        "grid_color": "#E5E7EB",
                        "decorative": False,
                        "name": "investment_bars",
                    }
                ],
            ),
            component(
                "chart_note",
                "Short source or reading note under the chart.",
                64,
                590,
                [
                    text(
                        "caption",
                        0,
                        0,
                        1152,
                        40,
                        "Fuente interna. Barras nativas para que el export PPTX conserve el gráfico.",
                        14,
                        colors["muted"],
                        max_len=140,
                    )
                ],
            ),
        ],
    }


def layout_two_col(theme: dict[str, Any]) -> dict[str, Any]:
    colors = theme["colors"]
    left = card("left", 552, 430, "Mercado", "Qué hace el competidor, precios y huecos que deja.", colors)
    right = card("right", 552, 430, "Nosotros", "Posición, oferta y la palanca que vamos a empujar.", colors)
    return {
        "id": "two_col",
        "description": "Dos columnas: mercado vs nosotros, antes/después o problema/solución.",
        "components": [
            background(colors),
            accent_bar(colors),
            header("Contraste", "Mercado frente a nuestra posición", colors),
            component(
                "columns",
                "Side-by-side comparison cards.",
                64,
                160,
                [
                    {
                        "type": "flex",
                        "size": {"width": 1152, "height": 430},
                        "direction": "row",
                        "gap": 24,
                        "name": "two_columns",
                        "min_children": 2,
                        "max_children": 2,
                        "children": [left, right],
                    }
                ],
            ),
        ],
    }


def layout_bullets(theme: dict[str, Any]) -> dict[str, Any]:
    colors = theme["colors"]
    items = [
        "Cerrar mix digital antes del 15 del mes.",
        "Reasignar un 8% de TV a retail media.",
        "Lanzar test de creatividades en dos cohortes.",
        "Revisar CPA de afiliación con el partner.",
        "Preparar el cierre trimestral con finanzas.",
    ]
    return {
        "id": "bullets",
        "description": "Lista con viñetas para roadmap, next steps o aprendizajes.",
        "components": [
            background(colors),
            accent_bar(colors),
            header("Roadmap", "Próximos pasos y owners", colors),
            component(
                "list_block",
                "Primary bullet list for sequential actions.",
                64,
                160,
                [
                    {
                        "type": "text-list",
                        "size": {"width": 1152, "height": 460},
                        "font": {
                            "size": 22,
                            "family": FONT,
                            "color": colors["primary_text"],
                            "line_height": 1.4,
                        },
                        "marker": "bullet",
                        "items": [[{"text": item}] for item in items],
                        "decorative": False,
                        "name": "next_steps",
                        "min_items": 3,
                        "max_items": 6,
                        "min_item_length": 20,
                        "max_item_length": 90,
                    }
                ],
            ),
        ],
    }


def layout_quote(theme: dict[str, Any]) -> dict[str, Any]:
    colors = theme["colors"]
    return {
        "id": "quote",
        "description": "Cita o insight destacado con atribución. Para learnings o voz de cliente.",
        "components": [
            background(colors, colors["background_alt"]),
            accent_bar(colors),
            component(
                "quote_block",
                "Large quote with attribution.",
                120,
                180,
                [
                    poly(64, 6, colors["primary"]),
                    text(
                        "quote",
                        0,
                        36,
                        1040,
                        220,
                        "El crecimiento no viene de más medios, viene de menos fricción en el punto de venta.",
                        36,
                        colors["primary_text"],
                        bold=True,
                        max_len=200,
                    ),
                    text(
                        "attribution",
                        0,
                        280,
                        800,
                        40,
                        "Dirección de marketing  ·  Q3 review",
                        18,
                        colors["muted"],
                        max_len=80,
                    ),
                ],
            ),
        ],
    }


def layout_close(theme: dict[str, Any]) -> dict[str, Any]:
    colors = theme["colors"]
    return {
        "id": "close",
        "description": "Cierre CTA a color: título, subtítulo y llamada a la acción.",
        "components": [
            background(colors, colors["close_bg"]),
            component(
                "close_copy",
                "Closing call to action on brand color.",
                80,
                200,
                [
                    text("close_kicker", 0, 0, 800, 28, "Siguiente paso", 16, colors["background_text"], bold=True, max_len=32),
                    text(
                        "close_title",
                        0,
                        40,
                        1100,
                        120,
                        "Aprobamos el mix y arrancamos el test",
                        48,
                        colors["background_text"],
                        bold=True,
                        max_len=72,
                    ),
                    text(
                        "close_cta",
                        0,
                        180,
                        900,
                        48,
                        "Reunión de kickoff · jueves 10:00",
                        22,
                        colors["background_text"],
                        max_len=80,
                    ),
                ],
            ),
        ],
    }


def build_layouts(theme: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        layout_cover(theme),
        layout_toc(theme),
        layout_chapter(theme),
        layout_kpis(theme),
        _cards_layout("cards_2", "Dos cards anchas: producto, competencia o pilares.", 2, theme),
        _cards_layout("cards_3", "Tres cards: oferta, learnings o workstreams.", 3, theme),
        _cards_layout("cards_4", "Cuatro cards en 2x2 para un mapa compacto.", 4, theme),
        layout_table(theme),
        layout_table_stats(theme),
        layout_bar_chart(theme),
        layout_two_col(theme),
        layout_bullets(theme),
        layout_quote(theme),
        layout_close(theme),
    ]


def build_theme_block(theme: dict[str, Any]) -> dict[str, Any]:
    colors = theme["colors"]
    graph = colors["graph"]
    return {
        "colors": {
            "primary": colors["primary"],
            "background": colors["background"],
            "card": colors["card"],
            "stroke": colors["stroke"],
            "primary_text": colors["primary_text"],
            "background_text": colors["background_text"],
            **{f"graph_{i}": graph[i] for i in range(10)},
        },
        "fonts": {"textFont": {"name": FONT, "url": FONT_URL}},
    }


def build_template(theme: dict[str, Any]) -> dict[str, Any]:
    layouts = build_layouts(theme)
    SlideLayouts.model_validate({"layouts": layouts})
    return {
        "id": theme["id"],
        "name": theme["name"],
        "description": theme["description"],
        "thumbnail": "static/thumbnail.png",
        "theme": build_theme_block(theme),
        "layouts": layouts,
    }


# ---------------------------------------------------------------------------
# Thumbnails
# ---------------------------------------------------------------------------

def _png(path: Path, width: int, height: int, pixel_at) -> None:
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            raw.extend(pixel_at(x, y))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    compressed = zlib.compress(bytes(raw), 9)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", compressed)
        + chunk(b"IEND", b"")
    )


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def write_thumbnail(path: Path, theme: dict[str, Any]) -> None:
    colors = theme["colors"]
    accent = hex_rgb(colors["cover_bg"])
    white = (255, 255, 255)
    card = hex_rgb(colors["background_alt"])
    ink = hex_rgb(colors["primary"])
    width, height = 640, 360

    def pixel(x: int, y: int) -> tuple[int, int, int]:
        if y < 10:
            return accent
        if x < 210:
            return accent
        if 250 <= x <= 600 and 70 <= y <= 130:
            return ink
        for i, top in enumerate((160, 230, 300)):
            if 250 <= x <= 600 and top <= y <= top + 40:
                return card
            if i == 2:
                break
        return white

    path.parent.mkdir(parents=True, exist_ok=True)
    _png(path, width, height, pixel)


def write_bundle(theme: dict[str, Any]) -> Path:
    target = ROOT / "templates" / theme["id"]
    target.mkdir(parents=True, exist_ok=True)
    payload = build_template(theme)
    (target / "template.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    write_thumbnail(target / "static" / "thumbnail.png", theme)
    return target


def main() -> None:
    for theme in (KH7, MINIMAL):
        path = write_bundle(theme)
        layouts = json.loads((path / "template.json").read_text(encoding="utf-8"))["layouts"]
        print(f"{theme['id']}: {len(layouts)} layouts → {path}")


if __name__ == "__main__":
    main()

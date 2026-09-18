"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { elementBox } from "@/components/slide-editor/model/element-model";
import {
  computeSimulationLayout,
  renderSimulationTableSvg,
  simulationInputCells,
  type SimulationInputCell,
} from "@/components/slide-editor/simulation/matrix-svg";
import type {
  SimulationConfig,
  SimulationSnapshot,
} from "@/components/slide-editor/types";
import { SimulationApi } from "@/components/slide-editor/simulation/api";
import {
  SIMULATION_BAND_COLORS,
  simulationFormatFromConfig,
} from "@/components/slide-editor/simulation/spec";
import { asRecord, type RawElement } from "@/components/slide-editor/model/core";

function cellKey(cell: SimulationInputCell): string {
  return `${cell.rowKey}::${cell.column.id}`;
}

function editValue(cell: SimulationInputCell): string {
  if (cell.column.format === "percent") {
    return String(Math.round(cell.value * 1000) / 10);
  }
  return String(Math.round(cell.value * 100) / 100);
}

/**
 * On-canvas inline editor. Renders the *same* simulation SVG at its natural
 * size inside a scrollable viewport (so the table scrolls when it doesn't fit),
 * and overlays inputs over the editable cells in the same scrolled coordinate
 * space — so the editable fields are part of the SVG visual and always aligned.
 */
export function SimulationInlineEditor({
  element,
  scale,
  onChange,
  onClose,
  onOpenConfig,
}: {
  element: RawElement;
  scale: number;
  onChange: (simulation: SimulationConfig) => void;
  onClose: () => void;
  onOpenConfig: () => void;
}) {
  const config = asRecord(element.simulation) as SimulationConfig | null;
  const snapshot = (config?.snapshot ?? null) as SimulationSnapshot | null;
  const workbookId = config?.workbook_id ?? null;
  const box = elementBox(element);

  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const svgInput = useMemo(
    () => ({
      snapshot,
      width: box.w,
      height: box.h,
      format: simulationFormatFromConfig(config),
      columnPrefs: config?.columns ?? null,
      mode: "natural" as const,
    }),
    [snapshot, box.w, box.h, config],
  );

  const layout = useMemo(() => computeSimulationLayout(svgInput), [svgInput]);
  const svg = useMemo(() => renderSimulationTableSvg(svgInput), [svgInput]);
  const cells = useMemo(() => simulationInputCells(svgInput), [svgInput]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const commit = async (cell: SimulationInputCell, raw: string) => {
    if (!workbookId || !config) {
      setError("Carga datos primero (Configurar → Cargar datos).");
      return;
    }
    const trimmed = raw.trim().replace(",", ".");
    let value: number | null;
    if (trimmed === "") {
      value = null;
    } else {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) return;
      value = cell.column.format === "percent" ? parsed / 100 : parsed;
    }
    const key = cellKey(cell);
    try {
      setSaving(key);
      const snap = await SimulationApi.setOverride(workbookId, {
        row_key: cell.rowKey,
        column_id: cell.column.id,
        value,
      });
      onChange({
        ...config,
        snapshot: snap,
        workbook_id: snap.workbook_id ?? workbookId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el valor");
    } finally {
      setSaving(null);
    }
  };

  const left = box.x * scale;
  const top = box.y * scale;
  const viewW = box.w * scale;
  const viewH = box.h * scale;

  return (
    <div
      data-inline-edit-ignore="true"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      style={{ position: "absolute", inset: 0, zIndex: 30, pointerEvents: "none" }}
    >
      {/* Toolbar */}
      <div
        style={{
          position: "absolute",
          left,
          top: Math.max(0, top - 32),
          display: "flex",
          gap: 6,
          pointerEvents: "auto",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 26,
            padding: "0 10px",
            borderRadius: 999,
            background: "#191919",
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          Editar simulación
        </span>
        <button type="button" onClick={onOpenConfig} style={pillButtonStyle}>
          Configurar
        </button>
        <button type="button" onClick={onClose} style={pillButtonStyle}>
          Cerrar
        </button>
      </div>

      {/* Scrollable viewport sized to the element; SVG at natural size inside */}
      <div
        onWheel={(event) => event.stopPropagation()}
        style={{
          position: "absolute",
          left,
          top,
          width: Math.max(1, viewW),
          height: Math.max(1, viewH),
          overflow: "auto",
          background: "#FFFFFF",
          border: "1px solid #7C51F8",
          borderRadius: 4,
          pointerEvents: "auto",
          boxSizing: "border-box",
        }}
      >
        {/* Natural-size content: the SVG + input overlays share these coords */}
        <div
          style={{
            position: "relative",
            width: layout.width * scale,
            height: layout.height * scale,
          }}
        >
          <div
            style={{ position: "absolute", inset: 0 }}
            // The exact same renderer used for the slide visual.
            dangerouslySetInnerHTML={{ __html: sizedSvg(svg, layout.width * scale, layout.height * scale) }}
          />
          {cells.map((cell) => (
            <input
              key={cellKey(cell)}
              defaultValue={editValue(cell)}
              disabled={!workbookId || saving === cellKey(cell)}
              title={cell.column.label}
              onFocus={(event) => {
                setError(null);
                event.currentTarget.select();
              }}
              onBlur={(event) => void commit(cell, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  (event.target as HTMLInputElement).blur();
                }
              }}
              style={{
                position: "absolute",
                left: cell.x * scale + 1,
                top: cell.y * scale + 1,
                width: Math.max(1, cell.w * scale - 2),
                height: Math.max(1, cell.h * scale - 2),
                padding: "0 6px",
                textAlign: "right",
                fontWeight: 600,
                fontSize: Math.max(8, Math.min(13, cell.h * scale * 0.42)),
                color: "#B54708",
                background: SIMULATION_BAND_COLORS.input,
                border: "1px solid #F59E0B",
                borderRadius: 2,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          ))}
        </div>
      </div>

      {(!workbookId || error) && (
        <div
          style={{
            position: "absolute",
            left,
            top: top + viewH + 6,
            padding: "6px 10px",
            borderRadius: 8,
            background: error ? "#FEF3F2" : "#FFF7ED",
            border: `1px solid ${error ? "#FECDCA" : "#FED7AA"}`,
            color: error ? "#B42318" : "#9A3412",
            fontSize: 11,
            pointerEvents: "auto",
          }}
        >
          {error ??
            "Aún no hay datos cargados. Pulsa «Configurar» y luego «Cargar datos»."}
        </div>
      )}
    </div>
  );
}

/** Force explicit pixel width/height on the SVG root so it renders 1:1. */
function sizedSvg(svg: string, width: number, height: number): string {
  return svg.replace(
    /^<svg\b[^>]*>/,
    (match) =>
      match
        .replace(/\swidth="[^"]*"/, ` width="${width}"`)
        .replace(/\sheight="[^"]*"/, ` height="${height}"`),
  );
}

const pillButtonStyle: CSSProperties = {
  height: 26,
  padding: "0 10px",
  borderRadius: 999,
  border: "1px solid #E6E6EA",
  background: "#fff",
  color: "#191919",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
};

"use client";

import { useEffect, useMemo, useState } from "react";
import { elementBox } from "@/components/slide-editor/model/element-model";
import {
  simulationInputCells,
  type SimulationInputCell,
} from "@/components/slide-editor/simulation/matrix-svg";
import type {
  SimulationConfig,
  SimulationSnapshot,
} from "@/components/slide-editor/types";
import { SimulationApi } from "@/components/slide-editor/simulation/api";
import { SIMULATION_BAND_COLORS } from "@/components/slide-editor/simulation/spec";
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
 * On-canvas inline editor for a simulation table: overlays an HTML `<input>`
 * over every editable (orange) cell so users can edit values directly on the
 * slide (Inforiver-style) instead of opening the configuration modal.
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

  const cells = useMemo(
    () =>
      simulationInputCells({
        snapshot,
        width: box.w,
        height: box.h,
        columnPrefs: config?.columns ?? null,
      }),
    [snapshot, box.w, box.h, config?.columns],
  );

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
    try {
      setSaving(cellKey(cell));
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

  const toolbarTop = Math.max(0, box.y * scale - 34);
  const toolbarLeft = box.x * scale;

  return (
    <div
      data-inline-edit-ignore="true"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 30,
        pointerEvents: "none",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          position: "absolute",
          left: toolbarLeft,
          top: toolbarTop,
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
        <button
          type="button"
          onClick={onOpenConfig}
          style={{
            height: 26,
            padding: "0 10px",
            borderRadius: 999,
            border: "1px solid #E6E6EA",
            background: "#fff",
            color: "#191919",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Configurar
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            height: 26,
            padding: "0 10px",
            borderRadius: 999,
            border: "1px solid #E6E6EA",
            background: "#fff",
            color: "#191919",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Cerrar
        </button>
      </div>

      {!workbookId ? (
        <div
          style={{
            position: "absolute",
            left: box.x * scale,
            top: box.y * scale + box.h * scale + 6,
            padding: "6px 10px",
            borderRadius: 8,
            background: "#FFF7ED",
            border: "1px solid #FED7AA",
            color: "#9A3412",
            fontSize: 11,
            pointerEvents: "auto",
          }}
        >
          Aún no hay datos cargados. Pulsa «Configurar» y luego «Cargar datos».
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            position: "absolute",
            left: box.x * scale,
            top: box.y * scale + box.h * scale + 6,
            padding: "6px 10px",
            borderRadius: 8,
            background: "#FEF3F2",
            border: "1px solid #FECDCA",
            color: "#B42318",
            fontSize: 11,
            pointerEvents: "auto",
          }}
        >
          {error}
        </div>
      ) : null}

      {/* One input per editable cell */}
      {cells.map((cell) => {
        const left = (box.x + cell.x) * scale;
        const top = (box.y + cell.y) * scale;
        const width = cell.w * scale;
        const height = cell.h * scale;
        const fontSize = Math.max(8, Math.min(13, height * 0.42));
        const key = cellKey(cell);
        return (
          <input
            key={key}
            defaultValue={editValue(cell)}
            disabled={!workbookId || saving === key}
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
              left: left + 1,
              top: top + 1,
              width: Math.max(1, width - 2),
              height: Math.max(1, height - 2),
              padding: "0 6px",
              textAlign: "right",
              fontWeight: 600,
              fontSize,
              color: "#B54708",
              background: SIMULATION_BAND_COLORS.input,
              border: "1px solid #F59E0B",
              borderRadius: 2,
              outline: "none",
              pointerEvents: "auto",
              boxSizing: "border-box",
            }}
          />
        );
      })}
    </div>
  );
}

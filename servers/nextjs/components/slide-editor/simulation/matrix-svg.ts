import type {
  SimulationColumn,
  SimulationColumnPref,
  SimulationRow,
  SimulationSnapshot,
} from "@/components/slide-editor/types";
import {
  SIMULATION_BAND_COLORS,
  SIMULATION_HEADER_COLORS,
  resolveDisplayColumns,
  simulationColumnsFor,
} from "@/components/slide-editor/simulation/spec";
import {
  formatSimulationCell,
  type SimulationFormatOptions,
} from "@/components/slide-editor/simulation/format";

export type SimulationSvgInput = {
  snapshot: SimulationSnapshot | null | undefined;
  width: number;
  height: number;
  format?: SimulationFormatOptions;
  columnPrefs?: SimulationColumnPref[] | null;
};

export type SimulationLayout = {
  width: number;
  height: number;
  columns: SimulationColumn[];
  bounds: Array<{ x: number; w: number }>;
  rows: SimulationRow[];
  headerH: number;
  totalsH: number;
  bodyH: number;
  rowH: number;
  fontSize: number;
  headerFont: number;
};

/** Geometry of a single editable (input) cell, in SVG/element-pixel space. */
export type SimulationInputCell = {
  rowKey: string;
  rowIndex: number;
  column: SimulationColumn;
  x: number;
  y: number;
  w: number;
  h: number;
  value: number;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnWeight(column: SimulationColumn): number {
  return column.kind === "label" ? 2.6 : 1;
}

/**
 * Compute the table layout (column bounds, header/row/total heights) shared by
 * the SVG renderer and the on-canvas inline editor so both stay pixel-aligned.
 */
export function computeSimulationLayout(
  input: SimulationSvgInput,
): SimulationLayout {
  const width = Math.max(1, input.width);
  const height = Math.max(1, input.height);
  const columns = resolveDisplayColumns(
    input.snapshot?.columns?.length
      ? input.snapshot.columns
      : simulationColumnsFor(input.snapshot?.pack),
    input.columnPrefs,
  );
  const rows = input.snapshot?.rows ?? [];

  const headerH = Math.min(34, Math.max(22, height * 0.09));
  const totalsH = Math.min(30, Math.max(20, height * 0.08));
  const bodyH = Math.max(0, height - headerH - totalsH);
  const rowH = rows.length > 0 ? bodyH / rows.length : bodyH;
  const fontSize = Math.max(8, Math.min(13, rowH * 0.42));
  const headerFont = Math.max(8, Math.min(12, headerH * 0.4));

  const totalWeight = columns.reduce((sum, col) => sum + columnWeight(col), 0);
  let x = 0;
  const bounds = columns.map((col) => {
    const w = (columnWeight(col) / totalWeight) * width;
    const box = { x, w };
    x += w;
    return box;
  });

  return {
    width,
    height,
    columns,
    bounds,
    rows,
    headerH,
    totalsH,
    bodyH,
    rowH,
    fontSize,
    headerFont,
  };
}

/** Return the geometry + current value of every editable cell in the matrix. */
export function simulationInputCells(
  input: SimulationSvgInput,
): SimulationInputCell[] {
  const layout = computeSimulationLayout(input);
  const cells: SimulationInputCell[] = [];
  layout.rows.forEach((row, rowIndex) => {
    const y = layout.headerH + rowIndex * layout.rowH;
    layout.columns.forEach((col, colIndex) => {
      if (col.kind !== "input") return;
      const box = layout.bounds[colIndex];
      cells.push({
        rowKey: row.row_key,
        rowIndex,
        column: col,
        x: box.x,
        y,
        w: box.w,
        h: layout.rowH,
        value: Number(row.values?.[col.id] ?? 0),
      });
    });
  });
  return cells;
}

export function renderSimulationTableSvg(input: SimulationSvgInput): string {
  const layout = computeSimulationLayout(input);
  const { width, height, columns, bounds, rows, headerH, totalsH, bodyH, rowH } =
    layout;
  const { fontSize, headerFont } = layout;
  const totals = input.snapshot?.totals ?? {};
  const format = input.format ?? {};

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Inter, Arial, sans-serif">`,
  );
  parts.push(`<rect width="${width}" height="${height}" fill="#FFFFFF"/>`);

  // Header
  columns.forEach((col, index) => {
    const box = bounds[index];
    const fill = SIMULATION_HEADER_COLORS[col.kind] ?? "#F2F4F7";
    parts.push(
      `<rect x="${box.x}" y="0" width="${box.w}" height="${headerH}" fill="${fill}" stroke="#E4E7EC" stroke-width="0.75"/>`,
    );
    const label = escapeXml(col.label || "");
    if (label) {
      const anchor = col.kind === "label" ? "start" : "end";
      const tx = col.kind === "label" ? box.x + 8 : box.x + box.w - 8;
      parts.push(
        `<text x="${tx}" y="${headerH / 2 + headerFont * 0.35}" font-size="${headerFont}" font-weight="600" fill="#344054" text-anchor="${anchor}">${label}</text>`,
      );
    }
  });

  // Body
  rows.forEach((row, rowIndex) => {
    const y = headerH + rowIndex * rowH;
    columns.forEach((col, colIndex) => {
      const box = bounds[colIndex];
      const band = SIMULATION_BAND_COLORS[col.kind] ?? "#FFFFFF";
      parts.push(
        `<rect x="${box.x}" y="${y}" width="${box.w}" height="${rowH}" fill="${band}" stroke="#EEF0F3" stroke-width="0.5"/>`,
      );
      const cy = y + rowH / 2 + fontSize * 0.35;
      if (col.kind === "label") {
        parts.push(
          `<text x="${box.x + 8}" y="${cy}" font-size="${fontSize}" fill="#101323" text-anchor="start">${escapeXml(
            row.label || row.row_key,
          )}</text>`,
        );
      } else {
        const value = Number(row.values?.[col.id] ?? 0);
        const text = escapeXml(formatSimulationCell(col, value, format));
        const color =
          col.format === "percent"
            ? value < 0
              ? "#B42318"
              : value > 0
                ? "#067647"
                : "#475467"
            : col.kind === "input"
              ? "#B54708"
              : "#101323";
        const weight = col.kind === "input" ? "600" : "400";
        parts.push(
          `<text x="${box.x + box.w - 8}" y="${cy}" font-size="${fontSize}" font-weight="${weight}" fill="${color}" text-anchor="end">${text}</text>`,
        );
      }
    });
  });

  // Totals
  const ty = headerH + bodyH;
  columns.forEach((col, colIndex) => {
    const box = bounds[colIndex];
    parts.push(
      `<rect x="${box.x}" y="${ty}" width="${box.w}" height="${totalsH}" fill="#F9FAFB" stroke="#D0D5DD" stroke-width="0.75"/>`,
    );
    const cy = ty + totalsH / 2 + fontSize * 0.35;
    if (col.kind === "label") {
      parts.push(
        `<text x="${box.x + 8}" y="${cy}" font-size="${fontSize}" font-weight="700" fill="#101323" text-anchor="start">Total</text>`,
      );
    } else {
      const value = Number(totals[col.id] ?? 0);
      const text = escapeXml(formatSimulationCell(col, value, format));
      parts.push(
        `<text x="${box.x + box.w - 8}" y="${cy}" font-size="${fontSize}" font-weight="700" fill="#101323" text-anchor="end">${text}</text>`,
      );
    }
  });

  // Top border of totals row
  parts.push(
    `<line x1="0" y1="${ty}" x2="${width}" y2="${ty}" stroke="#98A2B3" stroke-width="1.25"/>`,
  );

  parts.push("</svg>");
  return parts.join("");
}

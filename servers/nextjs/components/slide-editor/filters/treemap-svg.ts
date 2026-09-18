import {
  isTreemapCellActive,
  layoutTreemap,
  type TreemapCell,
  type TreemapNode,
} from "./treemap-layout.ts";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function px(value: number): number {
  return Math.round(value * 10) / 10;
}

function contrastText(hex: string): string {
  const raw = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  const r = Number.parseInt(raw.slice(0, 2), 16) || 0;
  const g = Number.parseInt(raw.slice(2, 4), 16) || 0;
  const b = Number.parseInt(raw.slice(4, 6), 16) || 0;
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.62 ? "#1F2937" : "#FFFFFF";
}

function cellOpacity(
  cell: TreemapCell,
  selected: Set<string>,
  nodes?: TreemapNode[] | null,
): number {
  return isTreemapCellActive(cell, selected, nodes) ? 1 : 0.38;
}

function cellLabel(cell: TreemapCell): string {
  if (cell.width < 28 || cell.height < 14) return "";
  const maxChars = Math.max(3, Math.floor(cell.width / 7.2));
  if (cell.caption.length <= maxChars) return cell.caption;
  return `${cell.caption.slice(0, Math.max(2, maxChars - 1))}…`;
}

export function renderTreemapSvg(input: {
  nodes?: TreemapNode[] | null;
  width?: number;
  height?: number;
  selected?: string[] | null;
}): string {
  const width = Math.max(40, Math.round(input.width ?? 720));
  const height = Math.max(40, Math.round(input.height ?? 360));
  const selected = new Set(input.selected ?? []);
  const cells = layoutTreemap(input.nodes ?? [], width, height);
  const body = cells
    .map((cell) => {
      const label = cellLabel(cell);
      const fill = cell.color;
      const opacity = cellOpacity(cell, selected, input.nodes);
      const textFill = contrastText(fill);
      const fontSize = cell.header || cell.depth === 0 ? 11 : 10;
      const textY = cell.header
        ? cell.y + 14
        : cell.y + Math.min(16, cell.height * 0.42);
      const text = label
        ? `<text x="${px(cell.x + 6)}" y="${px(textY)}" fill="${textFill}" font-size="${fontSize}" font-weight="${
            cell.depth === 0 ? 700 : 600
          }" font-family="Inter, Arial, Helvetica, sans-serif">${escapeXml(label)}</text>`
        : "";
      return `<g opacity="${opacity}"><rect x="${px(cell.x)}" y="${px(cell.y)}" width="${px(
        Math.max(0, cell.width),
      )}" height="${px(Math.max(0, cell.height))}" fill="${fill}" stroke="#FFFFFF" stroke-width="1.2"/>${text}</g>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Treemap">
  <rect width="${width}" height="${height}" fill="#FFFFFF"/>
  ${body}
</svg>`;
}

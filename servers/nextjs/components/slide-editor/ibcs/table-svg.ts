import { ibcsFormatFromConfig, type IbcsFormatOptions } from "./format.ts";
import {
  formatIbcsTableCell,
  ibcsTableNumericValue,
  visibleIbcsTableColumns,
  withIbcsTableTotal,
  type IbcsTableColumn,
  type IbcsTableMember,
  type IbcsTableViz,
} from "./table-columns.ts";

const COLOR = {
  text: "#101323",
  muted: "#475467",
  header: "#344054",
  line: "#D0D5DD",
  total: "#101323",
  ac: "#3F3F46",
  pos: "#12B76A",
  neg: "#E11D2E",
};

const FONT = "Inter, Arial, Helvetica, sans-serif";
const CELL_PAD = 5;

export type IbcsTableRenderInput = {
  members: IbcsTableMember[];
  columns?: IbcsTableColumn[] | null;
  width?: number;
  height?: number;
  format?: IbcsFormatOptions | null;
  title?: string | null;
};

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

function estimateTextWidth(text: string, fontSize: number): number {
  return Math.ceil(Math.max(1, text.length) * fontSize * 0.62);
}

function columnMinWidth(viz: IbcsTableViz, role: string): number {
  if (role === "label" || viz === "text") return 128;
  if (viz === "bar") return 118;
  if (viz === "variance" || viz === "variance_hatched") return 128;
  if (viz === "percent") return 64;
  return 72;
}

function columnWeight(viz: IbcsTableViz, role: string): number {
  if (role === "label" || viz === "text") return 1.8;
  if (viz === "bar") return 1.7;
  if (viz === "variance" || viz === "variance_hatched") return 1.8;
  if (viz === "percent") return 0.9;
  return 0.85;
}

function layoutColumns(
  columns: IbcsTableColumn[],
  plotW: number,
): { colX: number[]; colW: number[] } {
  const mins = columns.map((column) => columnMinWidth(column.viz, column.role));
  const weights = columns.map((column) => columnWeight(column.viz, column.role));
  const minSum = mins.reduce((sum, item) => sum + item, 0) || 1;
  const weightSum = weights.reduce((sum, item) => sum + item, 0) || 1;
  const colW =
    minSum <= plotW
      ? mins.map((min, index) => min + ((plotW - minSum) * weights[index]) / weightSum)
      : mins.map((min) => (min / minSum) * plotW);
  const colX: number[] = [];
  let cursor = 0;
  for (const size of colW) {
    colX.push(cursor);
    cursor += size;
  }
  return { colX, colW };
}

function hatchPattern(id: string, color: string): string {
  return `<pattern id="${id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="5" height="5" fill="${color}" opacity="0.18"/>
    <rect width="2.2" height="5" fill="${color}"/>
  </pattern>`;
}

function clipRect(id: string, x: number, y: number, width: number, height: number): string {
  return `<clipPath id="${id}"><rect x="${px(x)}" y="${px(y)}" width="${px(Math.max(0, width))}" height="${px(Math.max(0, height))}"/></clipPath>`;
}

function compactFormat(format: IbcsFormatOptions): IbcsFormatOptions {
  return { ...format, unit: null };
}

export function renderIbcsTableSvg(input: IbcsTableRenderInput): string {
  const width = Math.max(640, Math.round(input.width ?? 1120));
  const height = Math.max(180, Math.round(input.height ?? 360));
  const columns = visibleIbcsTableColumns(input.columns);
  const members = withIbcsTableTotal(input.members ?? []);
  const format = input.format ?? ibcsFormatFromConfig(null);
  const uid = `t${width}x${height}`;
  const pad = 10;
  const headerH = 26;
  const rowH = members.length
    ? Math.max(18, Math.min(28, (height - pad * 2 - headerH) / members.length))
    : 22;
  const plotX = pad;
  const plotW = width - pad * 2;
  const { colX, colW } = layoutColumns(columns, plotW);
  const originX = colX.map((x) => x + plotX);

  const maxAc = Math.max(1, ...members.map((item) => Math.abs(item.ac)));
  const maxDelta = Math.max(
    1,
    ...members.flatMap((item) => [
      Math.abs(item.ac - item.py),
      Math.abs(item.ac - item.pl),
      Math.abs(item.ac - item.fc),
    ]),
  );

  const clips = [
    ...columns.map((column, index) =>
      clipRect(
        `${uid}-h${index}`,
        originX[index] + 1,
        pad,
        colW[index] - 2,
        headerH,
      ),
    ),
    ...members.flatMap((_, rowIndex) =>
      columns.map((column, index) =>
        clipRect(
          `${uid}-c${index}r${rowIndex}`,
          originX[index] + 1,
          pad + headerH + rowIndex * rowH,
          colW[index] - 2,
          rowH,
        ),
      ),
    ),
  ].join("");

  const header = columns
    .map((column, index) => {
      const x =
        column.role === "label"
          ? originX[index] + CELL_PAD
          : originX[index] + colW[index] / 2;
      const anchor = column.role === "label" ? "start" : "middle";
      return `<g clip-path="url(#${uid}-h${index})"><text x="${px(x)}" y="${px(pad + 16)}" text-anchor="${anchor}" fill="${COLOR.header}" font-size="10" font-weight="700" font-family="${FONT}">${escapeXml(column.label)}</text></g>`;
    })
    .join("");

  const rows = members
    .map((member, rowIndex) => {
      const y = pad + headerH + rowIndex * rowH;
      const isTotal = rowIndex === 0;
      const baseline = y + rowH - 0.5;
      const textY = y + rowH * 0.68;
      const fontWeight = isTotal ? 700 : 500;
      const fill = isTotal ? COLOR.total : COLOR.text;
      const rule = isTotal
        ? `<line x1="${pad}" y1="${px(y)}" x2="${width - pad}" y2="${px(y)}" stroke="${COLOR.total}" stroke-width="1.2"/>`
        : `<line x1="${pad}" y1="${px(baseline)}" x2="${width - pad}" y2="${px(baseline)}" stroke="${COLOR.line}" stroke-width="0.6"/>`;
      const cells = columns
        .map((column, index) =>
          `<g clip-path="url(#${uid}-c${index}r${rowIndex})">${renderCell({
            column,
            member,
            format,
            x: originX[index],
            width: colW[index],
            y,
            rowH,
            textY,
            fontWeight,
            fill,
            maxAc,
            maxDelta,
            uid,
          })}</g>`,
        )
        .join("");
      return `${rule}${cells}`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Tabla IBCS">
  <defs>
    ${hatchPattern(`${uid}-pos`, COLOR.pos)}
    ${hatchPattern(`${uid}-neg`, COLOR.neg)}
    ${clips}
  </defs>
  <rect width="${width}" height="${height}" fill="#FFFFFF"/>
  ${header}
  ${rows}
</svg>`;
}

function renderCell(input: {
  column: IbcsTableColumn;
  member: IbcsTableMember;
  format: IbcsFormatOptions;
  x: number;
  width: number;
  y: number;
  rowH: number;
  textY: number;
  fontWeight: number;
  fill: string;
  maxAc: number;
  maxDelta: number;
  uid: string;
}): string {
  const { column, member } = input;
  if (column.role === "label" || column.viz === "text") {
    return `<text x="${px(input.x + CELL_PAD)}" y="${px(input.textY)}" fill="${input.fill}" font-size="11" font-weight="${input.fontWeight}" font-family="${FONT}">${escapeXml(member.caption)}</text>`;
  }

  const value = ibcsTableNumericValue(column.role, member);
  if (column.viz === "percent" || column.role.startsWith("pct_")) {
    const positive = value >= 0;
    const color = positive ? COLOR.pos : COLOR.neg;
    return `<text x="${px(input.x + input.width - CELL_PAD)}" y="${px(input.textY)}" text-anchor="end" fill="${color}" font-size="10" font-weight="600" font-family="${FONT}">${escapeXml(formatIbcsTableCell(column, member, input.format))}</text>`;
  }

  if (column.viz === "bar") {
    const label = formatIbcsTableCell(column, member, compactFormat(input.format));
    const labelW = Math.min(
      input.width * 0.55,
      Math.max(36, estimateTextWidth(label, 10) + 4),
    );
    const barH = Math.max(6, input.rowH * 0.42);
    const barY = input.y + (input.rowH - barH) / 2;
    const barMax = Math.max(4, input.width - CELL_PAD * 2 - labelW);
    const barW = Math.max(1.5, (Math.abs(member.ac) / input.maxAc) * barMax);
    return `
      <rect x="${px(input.x + CELL_PAD)}" y="${px(barY)}" width="${px(barW)}" height="${px(barH)}" fill="${COLOR.ac}"/>
      <text x="${px(input.x + input.width - CELL_PAD)}" y="${px(input.textY)}" text-anchor="end" fill="${COLOR.muted}" font-size="10" font-family="${FONT}">${escapeXml(label)}</text>
    `;
  }

  if (column.viz === "variance" || column.viz === "variance_hatched") {
    const label = formatIbcsTableCell(column, member, compactFormat(input.format));
    const labelW = Math.min(
      input.width * 0.46,
      Math.max(32, estimateTextWidth(label, 9) + 4),
    );
    const mid = input.x + input.width / 2;
    const barH = Math.max(6, input.rowH * 0.42);
    const barY = input.y + (input.rowH - barH) / 2;
    const barMax = Math.max(2, input.width / 2 - CELL_PAD - labelW);
    const barW = Math.max(1.2, (Math.abs(value) / input.maxDelta) * barMax);
    const positive = value >= 0;
    const color = positive ? COLOR.pos : COLOR.neg;
    const fill =
      column.viz === "variance_hatched"
        ? `url(#${input.uid}-${positive ? "pos" : "neg"})`
        : color;
    const barX = positive ? mid : mid - barW;
    const labelX = positive
      ? Math.min(input.x + input.width - CELL_PAD, mid + barW + 3)
      : Math.max(input.x + CELL_PAD, mid - barW - 3);
    const anchor = positive ? "start" : "end";
    return `
      <line x1="${px(mid)}" y1="${px(input.y + 3)}" x2="${px(mid)}" y2="${px(input.y + input.rowH - 3)}" stroke="${COLOR.line}" stroke-width="1"/>
      <rect x="${px(barX)}" y="${px(barY)}" width="${px(barW)}" height="${px(barH)}" fill="${fill}" stroke="${color}" stroke-width="0.8"/>
      <text x="${px(labelX)}" y="${px(input.textY)}" text-anchor="${anchor}" fill="${color}" font-size="9" font-weight="600" font-family="${FONT}">${escapeXml(label)}</text>
    `;
  }

  return `<text x="${px(input.x + input.width - CELL_PAD)}" y="${px(input.textY)}" text-anchor="end" fill="${input.fill}" font-size="10" font-weight="${input.fontWeight}" font-family="${FONT}">${escapeXml(formatIbcsTableCell(column, member, input.format))}</text>`;
}

import {
  formatIbcsNumber,
  formatPercent,
  ibcsFormatFromConfig,
  varianceRatio,
  type IbcsFormatOptions,
} from "./format.ts";
import {
  IBCS_TABLE_TOTAL_CODE,
  type IbcsTableMember,
} from "./table-columns.ts";
import {
  IBCS_WATERFALL_FROM_DEFAULT,
  normalizeVarianceRows,
  type IbcsVarianceBaseline,
  type IbcsVarianceRow,
} from "./spec.ts";

const COLOR = {
  text: "#101323",
  muted: "#667085",
  axis: "#98A2B3",
  start: "#9DC3E6",
  end: "#1A1A1A",
  pos: "#7CB342",
  neg: "#E11D2E",
  grid: "#E4E7EC",
  connector: "#98A2B3",
  baseline: "#98A2B3",
};

const FONT = "Inter, Arial, Helvetica, sans-serif";

export type IbcsWaterfallRenderInput = {
  members: IbcsTableMember[];
  width?: number;
  height?: number;
  title?: string | null;
  format?: IbcsFormatOptions | null;
  from?: IbcsVarianceBaseline | null;
  startLabel?: string | null;
  endLabel?: string | null;
  varianceRows?: IbcsVarianceRow[] | null;
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

function fromValue(member: IbcsTableMember, from: IbcsVarianceBaseline): number {
  if (from === "pl") return member.pl;
  if (from === "fc") return member.fc;
  return member.py;
}

function niceStep(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const factor = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return factor * pow;
}

function compact(format: IbcsFormatOptions): IbcsFormatOptions {
  return { ...format, unit: null };
}

type StepSlot = {
  caption: string;
  cx: number;
  barX: number;
  barW: number;
  kind: "start" | "end" | "delta";
  ratio: number;
};

export function renderIbcsWaterfallSvg(input: IbcsWaterfallRenderInput): string {
  const width = Math.max(480, Math.round(input.width ?? 1000));
  const height = Math.max(260, Math.round(input.height ?? 500));
  const format = input.format ?? ibcsFormatFromConfig(null);
  const from = input.from ?? IBCS_WATERFALL_FROM_DEFAULT;
  const varianceRows = normalizeVarianceRows(
    input.varianceRows ?? [{ baseline: from, style: "solid", label: null }],
  ).slice(0, 1);
  const title = input.title?.trim() || "";
  const startLabel = input.startLabel?.trim() || "PY";
  const endLabel = input.endLabel?.trim() || "AC";

  const body = (input.members ?? []).filter(
    (item) => item.code !== IBCS_TABLE_TOTAL_CODE,
  );
  const startTotal = body.reduce((sum, m) => sum + fromValue(m, from), 0);
  const endTotal = body.reduce((sum, m) => sum + m.ac, 0);
  const deltas = body.map((m) => m.ac - fromValue(m, from));

  // Cumulative levels c[0..n]; c[0] = start, c[n] = end.
  const levels: number[] = [startTotal];
  for (const d of deltas) levels.push(levels[levels.length - 1] + d);

  const scale = Math.min(width / 1000, height / 500);
  const pad = Math.round(12 * Math.max(0.8, scale));
  const leftGutter = Math.round(52 * Math.max(0.85, scale));
  const catLabelH = Math.round(30 * Math.max(0.85, scale));
  const titleH = title ? Math.round(22 * Math.max(0.85, scale)) : 0;
  const valueFont = Math.max(9, Math.round(11 * scale));
  const labelFont = Math.max(8, Math.round(9.5 * scale));
  const axisFont = Math.max(8, Math.round(9 * scale));

  const varRowH = varianceRows.length
    ? Math.max(40, Math.min(64, (height - pad * 2 - titleH) * 0.16))
    : 0;
  const varRegionH = varRowH * varianceRows.length;

  const mainTop = pad + titleH + varRegionH + Math.round(10 * scale);
  const mainBottom = height - pad - catLabelH;
  const plotH = Math.max(80, mainBottom - mainTop);
  const breakZone = Math.max(24, plotH * 0.2);
  const bandTopY = mainTop;
  const bandBotY = mainBottom - breakZone;

  // Zoomed band scale covering every cumulative level.
  const rawMin = Math.min(...levels);
  const rawMax = Math.max(...levels);
  const range = Math.max(1, rawMax - rawMin);
  const padV = range * 0.14;
  const bandMin = rawMin - padV;
  const bandMax = rawMax + padV;
  const yBand = (value: number) =>
    bandTopY + ((bandMax - value) / (bandMax - bandMin)) * (bandBotY - bandTopY);

  // Horizontal geometry: start, deltas…, end.
  const count = body.length + 2;
  const groupLeft = leftGutter + pad;
  const plotW = Math.max(80, width - groupLeft - pad);
  const slotW = plotW / count;
  const barW = Math.max(6, slotW * 0.6);

  const slotCx = (index: number) => groupLeft + index * slotW + slotW / 2;

  const slots: StepSlot[] = [];
  slots.push({
    caption: startLabel,
    cx: slotCx(0),
    barX: slotCx(0) - barW / 2,
    barW,
    kind: "start",
    ratio: 0,
  });
  body.forEach((m, i) => {
    slots.push({
      caption: m.caption,
      cx: slotCx(i + 1),
      barX: slotCx(i + 1) - barW / 2,
      barW,
      kind: "delta",
      ratio: varianceRatio(m.ac, fromValue(m, from)),
    });
  });
  slots.push({
    caption: endLabel,
    cx: slotCx(count - 1),
    barX: slotCx(count - 1) - barW / 2,
    barW,
    kind: "end",
    ratio: varianceRatio(endTotal, startTotal),
  });

  // ---- Y grid / ticks within the band ----
  const step = niceStep(range / 4);
  const ticks: string[] = [];
  const firstTick = Math.ceil(bandMin / step) * step;
  for (let v = firstTick; v <= bandMax; v += step) {
    const y = yBand(v);
    ticks.push(
      `<line x1="${px(groupLeft - 6)}" y1="${px(y)}" x2="${px(width - pad)}" y2="${px(y)}" stroke="${COLOR.grid}" stroke-width="0.8" stroke-dasharray="1 3"/>
      <text x="${px(leftGutter + pad - 10)}" y="${px(y + axisFont * 0.35)}" text-anchor="end" fill="${COLOR.axis}" font-size="${axisFont}" font-family="${FONT}">${escapeXml(formatIbcsNumber(v, compact(format)))}</text>`,
    );
  }
  // axis-break marker + zero baseline hint
  const breakMark = `<text x="${px(leftGutter + pad - 10)}" y="${px(mainBottom + axisFont * 0.2)}" text-anchor="end" fill="${COLOR.axis}" font-size="${axisFont}" font-family="${FONT}">0</text>
    <line x1="${px(groupLeft - 6)}" y1="${px(bandBotY + breakZone * 0.5)}" x2="${px(groupLeft - 2)}" y2="${px(bandBotY + breakZone * 0.5 - 4)}" stroke="${COLOR.axis}" stroke-width="1"/>
    <line x1="${px(groupLeft - 6)}" y1="${px(bandBotY + breakZone * 0.5 + 4)}" x2="${px(groupLeft - 2)}" y2="${px(bandBotY + breakZone * 0.5)}" stroke="${COLOR.axis}" stroke-width="1"/>`;

  // ---- Connectors between consecutive levels ----
  const connectors = levels
    .map((level, boundary) => {
      if (boundary >= slots.length - 1) return "";
      const left = slots[boundary];
      const right = slots[boundary + 1];
      const y = yBand(level);
      return `<line x1="${px(left.barX + left.barW)}" y1="${px(y)}" x2="${px(right.barX)}" y2="${px(y)}" stroke="${COLOR.connector}" stroke-width="0.8"/>`;
    })
    .join("");

  // ---- Bars ----
  const gradId = `wf-end-${width}x${height}`;
  const bars = slots
    .map((slot, index) => {
      if (slot.kind === "start" || slot.kind === "end") {
        const value = slot.kind === "start" ? startTotal : endTotal;
        const topY = yBand(value);
        const barH = Math.max(0, mainBottom - topY);
        const fill = slot.kind === "start" ? COLOR.start : `url(#${gradId})`;
        // subtle break glyph near the bottom of the full bar
        const gy = bandBotY + breakZone * 0.55;
        const glyph = `<path d="M ${px(slot.barX)} ${px(gy + 3)} L ${px(slot.barX + slot.barW)} ${px(gy - 3)} M ${px(slot.barX)} ${px(gy + 7)} L ${px(slot.barX + slot.barW)} ${px(gy + 1)}" stroke="#FFFFFF" stroke-width="2"/>`;
        const label = `<text x="${px(slot.cx)}" y="${px(topY - valueFont * 0.5)}" text-anchor="middle" fill="${COLOR.text}" font-size="${valueFont}" font-weight="700" font-family="${FONT}">${escapeXml(formatIbcsNumber(value, compact(format)))}</text>`;
        return `<rect x="${px(slot.barX)}" y="${px(topY)}" width="${px(slot.barW)}" height="${px(barH)}" fill="${fill}" shape-rendering="crispEdges"/>${glyph}${label}`;
      }
      const before = levels[index - 1];
      const after = levels[index];
      const delta = after - before;
      const positive = delta >= 0;
      const topY = yBand(Math.max(before, after));
      const botY = yBand(Math.min(before, after));
      const barH = Math.max(1.2, botY - topY);
      const color = positive ? COLOR.pos : COLOR.neg;
      const labelY = positive ? topY - valueFont * 0.4 : botY + valueFont;
      const label = `<text x="${px(slot.cx)}" y="${px(labelY)}" text-anchor="middle" fill="${COLOR.text}" font-size="${labelFont}" font-weight="600" font-family="${FONT}">${escapeXml(formatIbcsNumber(delta, compact(format)))}</text>`;
      return `<rect x="${px(slot.barX)}" y="${px(topY)}" width="${px(slot.barW)}" height="${px(barH)}" fill="${color}" shape-rendering="crispEdges"/>${label}`;
    })
    .join("");

  // ---- Category labels ----
  const catLabels = slots
    .map((slot) => {
      const isTotal = slot.kind !== "delta";
      const text = escapeXml(slot.caption);
      return `<text x="${px(slot.cx)}" y="${px(mainBottom + catLabelH * 0.5)}" text-anchor="middle" fill="${COLOR.muted}" font-size="${labelFont}" font-weight="${isTotal ? 700 : 500}" font-family="${FONT}">${text}</text>`;
    })
    .join("");

  // ---- Variance row (single) ----
  const varianceSvg = varianceRows
    .map((row) => {
      const bandBottom = mainTop - Math.round(6 * scale);
      const bandTop = bandBottom - varRowH;
      const baseY = bandTop + varRowH * 0.58;
      const ratios = slots.map((s) => s.ratio);
      const maxRatio = Math.max(0.01, ...ratios.map((r) => Math.abs(r)));
      const pinMaxUp = baseY - bandTop - labelFont;
      const pinMaxDown = bandBottom - baseY - labelFont;
      const dash = row.style === "dashed" ? ` stroke-dasharray="5 3"` : "";
      const caption = row.label?.trim() || `Δ${row.baseline.toUpperCase()}%`;
      const line = `<line x1="${px(groupLeft - 6)}" y1="${px(baseY)}" x2="${px(width - pad)}" y2="${px(baseY)}" stroke="${COLOR.baseline}" stroke-width="1"${dash}/>`;
      const rowLabel = `<text x="${px(pad)}" y="${px(baseY + labelFont * 0.35)}" fill="${COLOR.muted}" font-size="${labelFont}" font-weight="600" font-family="${FONT}">${escapeXml(caption)}</text>`;
      const pins = slots
        .map((slot) => {
          const ratio = slot.ratio;
          const positive = ratio >= 0;
          const color = positive ? COLOR.pos : COLOR.neg;
          const magnitude = (Math.abs(ratio) / maxRatio) * (positive ? pinMaxUp : pinMaxDown);
          const pinLen = Math.max(1.2, magnitude);
          const endY = positive ? baseY - pinLen : baseY + pinLen;
          const stem = `<line x1="${px(slot.cx)}" y1="${px(baseY)}" x2="${px(slot.cx)}" y2="${px(endY)}" stroke="${color}" stroke-width="${px(Math.max(2, slot.barW * 0.16))}"/>`;
          const cap = `<rect x="${px(slot.cx - 2.2)}" y="${px(endY - 2.2)}" width="4.4" height="4.4" fill="${color}"/>`;
          const labelY = positive ? endY - labelFont * 0.4 : endY + labelFont;
          const pct = `<text x="${px(slot.cx)}" y="${px(labelY)}" text-anchor="middle" fill="${COLOR.text}" font-size="${labelFont}" font-weight="${slot.kind !== "delta" ? 700 : 500}" font-family="${FONT}">${escapeXml(formatPercent(ratio))}</text>`;
          return `${stem}${cap}${pct}`;
        })
        .join("");
      return `${line}${rowLabel}${pins}`;
    })
    .join("");

  const titleSvg = title
    ? `<text x="${px(pad)}" y="${px(pad + titleH * 0.6)}" fill="${COLOR.muted}" font-size="${valueFont}" font-weight="600" font-family="${FONT}">${escapeXml(title)}</text>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Cascada IBCS">
  <defs>
    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3F3F46"/>
      <stop offset="100%" stop-color="#F4F4F5"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="#FFFFFF"/>
  ${titleSvg}
  ${ticks.join("")}
  ${breakMark}
  ${connectors}
  ${bars}
  ${catLabels}
  ${varianceSvg}
  <line x1="${px(groupLeft - 6)}" y1="${px(mainBottom)}" x2="${px(width - pad)}" y2="${px(mainBottom)}" stroke="${COLOR.axis}" stroke-width="1"/>
</svg>`;
}

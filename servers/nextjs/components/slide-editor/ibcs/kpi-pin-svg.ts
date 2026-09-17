import {
  formatCompact,
  formatPercent,
  varianceDelta,
  varianceRatio,
  type IbcsFormatOptions,
} from "./format.ts";
import {
  clampIbcsBarWidth,
  type IbcsScenarioId,
  type IbcsScenarioValues,
} from "./spec.ts";

const COLOR = {
  text: "#1A1A1A",
  muted: "#3F3F46",
  bar: "#3F3F46",
  barLabel: "#F4F4F5",
  negative: "#E11D2E",
  positive: "#12B76A",
  pin: "#C4C4CC",
  hairline: "#D4D4D8",
};

const FONT = "Inter, Arial, Helvetica, sans-serif";

export type IbcsKpiPinRenderInput = {
  values: IbcsScenarioValues;
  pinVs?: Exclude<IbcsScenarioId, "ac">;
  width?: number;
  height?: number;
  title?: string | null;
  format?: IbcsFormatOptions | null;
  barWidth?: number | null;
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

function approxTextWidth(text: string, fontSize: number): number {
  return Array.from(text).reduce((sum, char) => {
    if (char === "Δ") return sum + fontSize * 0.82;
    if (char === "%" || char === "+") return sum + fontSize * 0.7;
    if (char === " ") return sum + fontSize * 0.28;
    if (char === "," || char === "." || char === "-") return sum + fontSize * 0.38;
    return sum + fontSize * 0.62;
  }, 0);
}

function arrow(cx: number, cy: number, up: boolean, fill: string, size = 5): string {
  const s = px(size);
  const x = px(cx);
  const y = px(cy);
  if (up) {
    return `<polygon points="${x},${y - s} ${x + s},${y + s * 0.8} ${x - s},${y + s * 0.8}" fill="${fill}"/>`;
  }
  return `<polygon points="${x},${y + s} ${x + s},${y - s * 0.8} ${x - s},${y - s * 0.8}" fill="${fill}"/>`;
}

function alarmRow(
  x: number,
  y: number,
  label: string,
  actual: number,
  baseline: number,
  fontSize: number,
): string {
  const ratio = varianceRatio(actual, baseline);
  const positive = ratio >= 0;
  const fill = positive ? COLOR.positive : COLOR.negative;
  const text = `${label} ${formatPercent(ratio)}`;
  const arrowX = x + approxTextWidth(text, fontSize) + fontSize * 0.7;
  return `
    <text x="${px(x)}" y="${px(y)}" fill="${fill}" font-size="${fontSize}" font-weight="600" font-family="${FONT}">${escapeXml(text)}</text>
    ${arrow(arrowX, y - fontSize * 0.32, positive, fill, Math.max(4, fontSize * 0.32))}
  `;
}

export function renderIbcsKpiPinSvg(input: IbcsKpiPinRenderInput): string {
  const width = Math.max(360, Math.round(input.width ?? 640));
  const height = Math.max(220, Math.round(input.height ?? 360));
  const values = input.values;
  const pinVs = input.pinVs ?? "fc";
  const baseline = values[pinVs];
  const delta = varianceDelta(values.ac, baseline);
  const ratio = varianceRatio(values.ac, baseline);
  const positive = delta >= 0;
  const pinColor = positive ? COLOR.positive : COLOR.negative;
  const title = input.title?.trim() || "";

  const pad = Math.round(Math.min(width, height) * 0.055);
  const titleOffset = title ? Math.round(height * 0.08) : 0;
  const scale = Math.min(width / 640, height / 360);
  const kpiSize = Math.round(Math.min(56, Math.max(32, 48 * scale)));
  const labelSize = Math.round(Math.min(22, Math.max(13, 18 * scale)));
  const alarmSize = Math.round(Math.min(20, Math.max(13, 17 * scale)));
  const annoSize = Math.round(Math.min(16, Math.max(11, 14 * scale)));

  const plotTop = pad + titleOffset + annoSize + 14;
  const plotBottom = height - pad;
  const plotH = Math.max(72, plotBottom - plotTop);
  const maxValue = Math.max(Math.abs(values.ac), Math.abs(baseline), 1);
  const acH = (Math.abs(values.ac) / maxValue) * plotH;
  const baseH = (Math.abs(baseline) / maxValue) * plotH;
  const yAc = plotBottom - acH;
  const yBase = plotBottom - baseH;
  const yVarTop = Math.min(yAc, yBase);
  const varianceH = Math.abs(yAc - yBase);
  const showVariance = varianceH > 0.75;
  const overlayH = showVariance ? Math.max(3.5, varianceH) : 0;

  const format = input.format ?? {};
  const barW = Math.round(
    Math.min(160, Math.max(36, width * (clampIbcsBarWidth(input.barWidth) / 100))),
  );
  const barX = Math.round(width * 0.58);
  const barCx = barX + barW / 2;
  const pinY = showVariance ? yVarTop + overlayH / 2 : yBase;
  const pinW = Math.round(Math.max(10, 14 * scale));
  const pinH = Math.round(Math.max(8, 12 * scale));

  const leftX = pad;
  const kpiY = Math.round(height * (title ? 0.42 : 0.4));
  const acLabelY = kpiY - Math.round(kpiSize * 0.92);
  const alarmsTop = kpiY + Math.round(kpiSize * 0.95);
  const alarmGap = Math.round(alarmSize * 1.75);

  const labelY = Math.max(pad + titleOffset + annoSize, yVarTop - 8);
  const pctX = barX + barW + Math.round(22 * scale);
  const innerLabelY = Math.min(
    plotBottom - 14,
    yAc + acH * 0.52 + annoSize / 2,
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="KPI IBCS">
  <rect width="${width}" height="${height}" fill="#FFFFFF"/>
  ${title ? `<text x="${leftX}" y="${pad + 14}" fill="${COLOR.muted}" font-size="${labelSize - 2}" font-family="${FONT}">${escapeXml(title)}</text>` : ""}
  <text x="${leftX}" y="${acLabelY}" fill="${COLOR.muted}" font-size="${labelSize}" font-weight="600" letter-spacing="0.04em" font-family="${FONT}">AC AY</text>
  <text x="${leftX}" y="${kpiY}" fill="${COLOR.text}" font-size="${kpiSize}" font-weight="700" font-family="${FONT}">${escapeXml(formatCompact(values.ac, format))}</text>
  ${alarmRow(leftX, alarmsTop, "ΔPY", values.ac, values.py, alarmSize)}
  ${alarmRow(leftX, alarmsTop + alarmGap, "ΔFC", values.ac, values.fc, alarmSize)}
  ${alarmRow(leftX, alarmsTop + alarmGap * 2, "ΔPL", values.ac, values.pl, alarmSize)}

  <polygon points="${px(barX - pinW)},${px(pinY - pinH / 2)} ${px(barX)},${px(pinY)} ${px(barX - pinW)},${px(pinY + pinH / 2)}" fill="${COLOR.pin}"/>
  <rect x="${px(barX)}" y="${px(yAc)}" width="${barW}" height="${px(acH)}" fill="${COLOR.bar}" shape-rendering="crispEdges"/>
  ${
    showVariance
      ? `<rect x="${px(barX)}" y="${px(yVarTop)}" width="${barW}" height="${px(overlayH)}" fill="${pinColor}" shape-rendering="crispEdges"/>`
      : ""
  }
  <text x="${px(barCx)}" y="${px(innerLabelY)}" text-anchor="middle" fill="${COLOR.barLabel}" font-size="${annoSize + 2}" font-weight="700" font-family="${FONT}">${escapeXml(formatCompact(values.ac, format))}</text>
  <text x="${px(barCx)}" y="${px(labelY)}" text-anchor="middle" fill="${COLOR.text}" font-size="${annoSize}" font-weight="600" font-family="${FONT}">${escapeXml(formatCompact(delta, format))}</text>
  <line x1="${px(barX + barW)}" y1="${px(pinY)}" x2="${px(pctX - 6)}" y2="${px(pinY)}" stroke="${COLOR.hairline}" stroke-width="1"/>
  ${arrow(pctX, pinY, positive, pinColor, Math.max(4, annoSize * 0.36))}
  <text x="${px(pctX + 10)}" y="${px(pinY + annoSize * 0.35)}" fill="${pinColor}" font-size="${annoSize}" font-weight="600" font-family="${FONT}">${escapeXml(formatPercent(ratio))}</text>
</svg>`;
}

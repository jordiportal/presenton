import {
  formatIbcsNumber,
  formatPercent,
  ibcsFormatFromConfig,
  varianceDelta,
  varianceRatio,
  type IbcsFormatOptions,
} from "./format.ts";
import {
  IBCS_TABLE_TOTAL_CODE,
  type IbcsTableMember,
} from "./table-columns.ts";
import {
  IBCS_COLUMN_OVERLAY_DEFAULT,
  normalizeVarianceRows,
  type IbcsVarianceBaseline,
  type IbcsVarianceRow,
} from "./spec.ts";

const COLOR = {
  text: "#101323",
  muted: "#667085",
  axis: "#98A2B3",
  bar: "#1A1A1A",
  barLabel: "#F4F4F5",
  pos: "#7CB342",
  neg: "#E11D2E",
  grid: "#E4E7EC",
  baseline: "#98A2B3",
};

const FONT = "Inter, Arial, Helvetica, sans-serif";

export type IbcsColumnRenderInput = {
  members: IbcsTableMember[];
  width?: number;
  height?: number;
  title?: string | null;
  format?: IbcsFormatOptions | null;
  overlayBaseline?: IbcsVarianceBaseline | null;
  varianceRows?: IbcsVarianceRow[] | null;
  showTotal?: boolean | null;
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
  return Math.ceil(Math.max(1, text.length) * fontSize * 0.6);
}

function baselineValue(member: IbcsTableMember, baseline: IbcsVarianceBaseline): number {
  if (baseline === "pl") return member.pl;
  if (baseline === "fc") return member.fc;
  return member.py;
}

function totalMember(body: IbcsTableMember[]): IbcsTableMember {
  const total: IbcsTableMember = {
    code: IBCS_TABLE_TOTAL_CODE,
    caption: "Total",
    ac: 0,
    py: 0,
    pl: 0,
    fc: 0,
  };
  for (const item of body) {
    total.ac += item.ac;
    total.py += item.py;
    total.pl += item.pl;
    total.fc += item.fc;
  }
  return total;
}

function niceStep(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const factor = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return factor * pow;
}

function triangle(cx: number, cy: number, up: boolean, fill: string, size: number): string {
  const s = px(size);
  const x = px(cx);
  const y = px(cy);
  if (up) {
    return `<polygon points="${x},${y - s} ${x + s},${y + s} ${x - s},${y + s}" fill="${fill}"/>`;
  }
  return `<polygon points="${x},${y + s} ${x + s},${y - s} ${x - s},${y - s}" fill="${fill}"/>`;
}

function compact(format: IbcsFormatOptions): IbcsFormatOptions {
  return { ...format, unit: null };
}

type Slot = { member: IbcsTableMember; cx: number; barX: number; barW: number; isTotal: boolean };

export function renderIbcsColumnSvg(input: IbcsColumnRenderInput): string {
  const width = Math.max(420, Math.round(input.width ?? 960));
  const height = Math.max(240, Math.round(input.height ?? 480));
  const format = input.format ?? ibcsFormatFromConfig(null);
  const overlayBaseline = input.overlayBaseline ?? IBCS_COLUMN_OVERLAY_DEFAULT;
  const varianceRows = normalizeVarianceRows(input.varianceRows);
  const showTotal = input.showTotal !== false;
  const title = input.title?.trim() || "";

  const body = (input.members ?? []).filter(
    (item) => item.code !== IBCS_TABLE_TOTAL_CODE,
  );
  const total = totalMember(body);
  const slotsData = showTotal ? [...body, total] : body;
  const count = Math.max(1, slotsData.length);

  const scale = Math.min(width / 960, height / 480);
  const pad = Math.round(12 * Math.max(0.8, scale));
  const leftGutter = Math.round(50 * Math.max(0.85, scale));
  const catLabelH = Math.round(22 * Math.max(0.85, scale));
  const titleH = title ? Math.round(22 * Math.max(0.85, scale)) : 0;
  const valueFont = Math.max(9, Math.round(11 * scale));
  const labelFont = Math.max(8, Math.round(10 * scale));
  const axisFont = Math.max(8, Math.round(9.5 * scale));

  const varRowH = varianceRows.length
    ? Math.max(38, Math.min(64, (height - pad * 2 - titleH) * 0.16))
    : 0;
  const varRegionH = varRowH * varianceRows.length;

  const mainTop = pad + titleH + varRegionH + Math.round(10 * scale);
  const mainBottom = height - pad - catLabelH;
  const plotH = Math.max(60, mainBottom - mainTop);

  // Horizontal slot geometry (body left, Total separated on the right).
  const groupLeft = leftGutter + pad;
  const plotW = Math.max(60, width - groupLeft - pad);
  const totalGapUnits = showTotal ? 0.7 : 0;
  const slotW = plotW / (count + totalGapUnits);
  const barFrac = 0.52;
  const barW = Math.max(6, slotW * barFrac);

  const slots: Slot[] = slotsData.map((member, index) => {
    const isTotal = showTotal && index === slotsData.length - 1;
    const gap = isTotal ? totalGapUnits * slotW : 0;
    const slotX = groupLeft + index * slotW + gap;
    const cx = slotX + slotW / 2;
    return {
      member,
      cx,
      barX: cx - barW / 2,
      barW,
      isTotal,
    };
  });

  // Vertical scale for the AC columns (include overlay baseline so refs fit).
  const maxScale = Math.max(
    1,
    ...slotsData.flatMap((m) => [Math.abs(m.ac), Math.abs(baselineValue(m, overlayBaseline))]),
  );
  const yOf = (value: number) => mainBottom - (value / maxScale) * plotH;

  // ---- Y grid + axis ticks ----
  const step = niceStep(maxScale / 4);
  const ticks: number[] = [];
  for (let v = 0; v <= maxScale + step * 0.001; v += step) ticks.push(v);
  const grid = ticks
    .map((v) => {
      const y = yOf(v);
      return `<line x1="${px(groupLeft - 6)}" y1="${px(y)}" x2="${px(width - pad)}" y2="${px(y)}" stroke="${COLOR.grid}" stroke-width="0.8" stroke-dasharray="1 3"/>
      <text x="${px(leftGutter + pad - 10)}" y="${px(y + axisFont * 0.35)}" text-anchor="end" fill="${COLOR.axis}" font-size="${axisFont}" font-family="${FONT}">${escapeXml(formatIbcsNumber(v, compact(format)))}</text>`;
    })
    .join("");

  // ---- Main columns (AC bar + Δ overlay + labels) ----
  const bars = slots
    .map((slot) => {
      const { member, cx, barX, barW: bw, isTotal } = slot;
      const ac = member.ac;
      const ref = baselineValue(member, overlayBaseline);
      const delta = varianceDelta(ac, ref);
      const positive = delta >= 0;
      const yAc = yOf(Math.max(0, ac));
      const yRef = yOf(Math.max(0, ref));
      const overlayColor = positive ? COLOR.pos : COLOR.neg;

      // black AC bar from yAc to baseline (0)
      const barH = Math.max(0, mainBottom - yAc);
      const blackBar = `<rect x="${px(barX)}" y="${px(yAc)}" width="${px(bw)}" height="${px(barH)}" fill="${COLOR.bar}" shape-rendering="crispEdges"/>`;

      // Δ overlay: green cap on top of bar (surplus) or red block above bar (deficit)
      let overlay = "";
      if (Math.abs(yAc - yRef) > 0.6) {
        const oy = Math.min(yAc, yRef);
        const oh = Math.abs(yAc - yRef);
        overlay = `<rect x="${px(barX)}" y="${px(oy)}" width="${px(bw)}" height="${px(oh)}" fill="${overlayColor}" shape-rendering="crispEdges"/>`;
      }

      // triangle marker at the very top of the column
      const markY = Math.min(yAc, yRef) - Math.max(4, valueFont * 0.5);
      const marker = triangle(barX + bw + 3, markY + valueFont * 0.3, positive, overlayColor, Math.max(3, valueFont * 0.32));

      // AC value inside the bar (white), if the bar is tall enough
      const innerY = Math.min(mainBottom - 4, yAc + Math.max(barH * 0.5, valueFont));
      const acLabel =
        barH > valueFont * 1.6
          ? `<text x="${px(cx)}" y="${px(innerY)}" text-anchor="middle" fill="${COLOR.barLabel}" font-size="${valueFont}" font-weight="700" font-family="${FONT}">${escapeXml(formatIbcsNumber(ac, compact(format)))}</text>`
          : `<text x="${px(cx)}" y="${px(yAc - 4)}" text-anchor="middle" fill="${COLOR.text}" font-size="${valueFont}" font-weight="700" font-family="${FONT}">${escapeXml(formatIbcsNumber(ac, compact(format)))}</text>`;

      // Δ value above the column
      const deltaY = Math.min(yAc, yRef) - Math.max(8, valueFont * 0.9);
      const deltaLabel = `<text x="${px(cx)}" y="${px(deltaY)}" text-anchor="middle" fill="${COLOR.text}" font-size="${labelFont}" font-weight="${isTotal ? 700 : 600}" font-family="${FONT}">${escapeXml(formatIbcsNumber(delta, compact(format)))}</text>`;

      // category label at the bottom
      const catLabel = `<text x="${px(cx)}" y="${px(mainBottom + catLabelH * 0.7)}" text-anchor="middle" fill="${COLOR.muted}" font-size="${labelFont}" font-weight="${isTotal ? 700 : 500}" font-family="${FONT}">${escapeXml(member.caption)}</text>`;

      return `${blackBar}${overlay}${marker}${acLabel}${deltaLabel}${catLabel}`;
    })
    .join("");

  // Left axis captions (Δ overlay label + AC)
  const overlayLabel = overlayBaseline === "fc" ? "ΔFC" : overlayBaseline === "pl" ? "ΔPL" : "ΔPY";
  const axisCaptions = `
    <text x="${px(pad)}" y="${px(mainTop + valueFont)}" fill="${COLOR.muted}" font-size="${labelFont}" font-weight="600" font-family="${FONT}">${escapeXml(overlayLabel)}</text>
    <text x="${px(pad)}" y="${px(mainBottom - plotH * 0.35)}" fill="${COLOR.muted}" font-size="${labelFont}" font-weight="600" font-family="${FONT}">AC</text>`;

  // ---- Variance rows (%), stacked upward: index 0 nearest the columns ----
  const varianceSvg = varianceRows
    .map((row, rowIndex) => {
      const bandBottom = mainTop - Math.round(6 * scale) - rowIndex * varRowH;
      const bandTop = bandBottom - varRowH;
      const baseY = bandTop + varRowH * 0.58;
      const ratios = slotsData.map((m) => varianceRatio(m.ac, baselineValue(m, row.baseline)));
      const maxRatio = Math.max(0.01, ...ratios.map((r) => Math.abs(r)));
      const pinMaxUp = baseY - bandTop - labelFont;
      const pinMaxDown = bandBottom - baseY - labelFont;

      const dash = row.style === "dashed" ? ` stroke-dasharray="5 3"` : "";
      const line = `<line x1="${px(groupLeft - 6)}" y1="${px(baseY)}" x2="${px(width - pad)}" y2="${px(baseY)}" stroke="${COLOR.baseline}" stroke-width="1"${dash}/>`;

      const caption = row.label?.trim() || `Δ${row.baseline.toUpperCase()}%`;
      const rowLabel = `<text x="${px(pad)}" y="${px(baseY + labelFont * 0.35)}" fill="${COLOR.muted}" font-size="${labelFont}" font-weight="600" font-family="${FONT}">${escapeXml(caption)}</text>`;

      const pins = slots
        .map((slot, index) => {
          const ratio = ratios[index];
          const positive = ratio >= 0;
          const color = positive ? COLOR.pos : COLOR.neg;
          const magnitude = (Math.abs(ratio) / maxRatio) * (positive ? pinMaxUp : pinMaxDown);
          const pinLen = Math.max(1.5, magnitude);
          const endY = positive ? baseY - pinLen : baseY + pinLen;
          const stem = `<line x1="${px(slot.cx)}" y1="${px(baseY)}" x2="${px(slot.cx)}" y2="${px(endY)}" stroke="${color}" stroke-width="${px(Math.max(2, slot.barW * 0.16))}"/>`;
          const cap = `<rect x="${px(slot.cx - 2.2)}" y="${px(endY - 2.2)}" width="4.4" height="4.4" fill="${color}"/>`;
          const labelY = positive ? endY - labelFont * 0.4 : endY + labelFont;
          const pct = `<text x="${px(slot.cx)}" y="${px(labelY)}" text-anchor="middle" fill="${COLOR.text}" font-size="${labelFont}" font-weight="${slot.isTotal ? 700 : 500}" font-family="${FONT}">${escapeXml(formatPercent(ratio))}</text>`;
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
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico de columnas IBCS">
  <rect width="${width}" height="${height}" fill="#FFFFFF"/>
  ${titleSvg}
  ${grid}
  ${axisCaptions}
  ${bars}
  ${varianceSvg}
  <line x1="${px(groupLeft - 6)}" y1="${px(mainBottom)}" x2="${px(width - pad)}" y2="${px(mainBottom)}" stroke="${COLOR.axis}" stroke-width="1"/>
</svg>`;
}

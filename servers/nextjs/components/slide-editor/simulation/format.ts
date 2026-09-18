import type {
  SimulationColumn,
  SimulationScale,
} from "@/components/slide-editor/types";

const PERCENT_FORMAT = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export type SimulationFormatOptions = {
  decimals?: number | null;
  unit?: string | null;
  scale?: SimulationScale | null;
  scaleLabel?: string | null;
};

const SCALE_DIVISOR: Record<Exclude<SimulationScale, "auto">, number> = {
  none: 1,
  thousands: 1_000,
  millions: 1_000_000,
};

const SCALE_SUFFIX: Record<Exclude<SimulationScale, "auto" | "none">, string> = {
  thousands: "K",
  millions: "M",
};

function resolveScale(
  abs: number,
  scale: SimulationScale | null | undefined,
): { divisor: number; suffix: string } {
  if (scale === "auto") {
    if (abs >= 1_000_000) return { divisor: 1_000_000, suffix: "M" };
    if (abs >= 1_000) return { divisor: 1_000, suffix: "K" };
    return { divisor: 1, suffix: "" };
  }
  if (scale && scale !== "none") {
    return { divisor: SCALE_DIVISOR[scale], suffix: SCALE_SUFFIX[scale] };
  }
  return { divisor: 1, suffix: "" };
}

function groupedNumber(value: number, decimals: number): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** A percent stored as a fraction (0.05) is rendered as 5,0%. */
export function formatSimulationPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${PERCENT_FORMAT.format(value * 100)}%`;
}

export function formatSimulationNumber(
  value: number,
  options: SimulationFormatOptions = {},
): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const { divisor, suffix } = resolveScale(abs, options.scale);
  const scaled = divisor !== 1;
  const decimals = scaled
    ? Math.max(0, Math.min(4, options.decimals == null ? 1 : Math.round(options.decimals)))
    : Math.max(0, Math.min(4, options.decimals == null ? 0 : Math.round(options.decimals)));
  const custom = (options.scaleLabel ?? "").trim();
  const suffixPart = custom ? ` ${custom}` : suffix;
  const body = groupedNumber(abs / divisor, decimals);
  const unit = (options.unit ?? "").trim();
  const unitPart = unit && unit !== suffix ? ` ${unit}` : "";
  return `${sign}${body}${suffixPart}${unitPart}`;
}

export function formatSimulationCell(
  column: SimulationColumn,
  value: number,
  options: SimulationFormatOptions = {},
): string {
  if (column.format === "percent") return formatSimulationPercent(value);
  // VN unitaria wants a couple of decimals and never a K/M scale.
  if (column.id === "vn_un" || column.id === "simu_vn_un") {
    return formatSimulationNumber(value, {
      decimals: 2,
      unit: options.unit,
      scale: "none",
    });
  }
  return formatSimulationNumber(value, options);
}

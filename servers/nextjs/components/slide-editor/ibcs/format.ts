const PCT_FORMAT = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export type IbcsScale = "auto" | "none" | "thousands" | "millions";

export type IbcsFormatOptions = {
  scale?: IbcsScale | null;
  scaleLabel?: string | null;
  decimals?: number | null;
  unit?: string | null;
};

const SCALE_DIVISOR: Record<Exclude<IbcsScale, "auto">, number> = {
  none: 1,
  thousands: 1_000,
  millions: 1_000_000,
};

const SCALE_SUFFIX: Record<Exclude<IbcsScale, "auto" | "none">, string> = {
  thousands: "K",
  millions: "M",
};

function isPercentUnit(unit?: string | null): boolean {
  const normalized = (unit ?? "").trim().toLowerCase();
  return normalized === "%" || normalized === "pct" || normalized === "percent";
}

function resolvedDecimals(
  options: IbcsFormatOptions,
  scaled: boolean,
): number {
  if (options.decimals != null && Number.isFinite(options.decimals)) {
    return Math.max(0, Math.min(6, Math.round(options.decimals)));
  }
  return scaled ? 1 : 0;
}

function formatGrouped(abs: number, decimals: number): string {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(abs);
}

function autoScale(abs: number): { divisor: number; suffix: string } {
  if (abs >= 1_000_000) return { divisor: 1_000_000, suffix: "M" };
  if (abs >= 1_000) return { divisor: 1_000, suffix: "K" };
  return { divisor: 1, suffix: "" };
}

export function parseIbcsDecimals(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(6, Math.round(parsed)));
}

export function parseIbcsScale(value: unknown): IbcsScale {
  if (value === "none" || value === "thousands" || value === "millions") {
    return value;
  }
  return "auto";
}

export function ibcsFormatFromConfig(config?: {
  scale?: string | null;
  scale_label?: string | null;
  decimals?: number | null;
  unit?: string | null;
} | null): IbcsFormatOptions {
  return {
    scale: parseIbcsScale(config?.scale),
    scaleLabel: config?.scale_label,
    decimals: parseIbcsDecimals(config?.decimals),
    unit: config?.unit,
  };
}

export function formatIbcsNumber(
  value: number,
  options: IbcsFormatOptions = {},
): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const unit = (options.unit ?? "").trim();

  if (isPercentUnit(unit)) {
    const decimals = resolvedDecimals(options, true);
    return `${sign}${formatGrouped(abs, decimals)}%`;
  }

  const scale = parseIbcsScale(options.scale);
  let divisor = 1;
  let suffix = "";
  if (scale === "auto") {
    const auto = autoScale(abs);
    divisor = auto.divisor;
    suffix = auto.suffix;
  } else if (scale !== "none") {
    divisor = SCALE_DIVISOR[scale];
    suffix = SCALE_SUFFIX[scale];
  }

  const custom = (options.scaleLabel ?? "").trim();
  if (custom) suffix = custom;

  const scaled = divisor !== 1;
  const decimals = resolvedDecimals(options, scaled);
  const body = formatGrouped(abs / divisor, decimals);
  const suffixPart = suffix ? (custom ? ` ${suffix}` : suffix) : "";
  const unitPart = unit && unit !== suffix ? ` ${unit}` : "";
  return `${sign}${body}${suffixPart}${unitPart}`;
}

export function formatCompact(
  value: number,
  options: IbcsFormatOptions = {},
): string {
  return formatIbcsNumber(value, options);
}

export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return "—";
  const signed = ratio > 0 ? "+" : "";
  return `${signed}${PCT_FORMAT.format(ratio * 100)}%`;
}

/** (actual - baseline) / |baseline| */
export function varianceRatio(actual: number, baseline: number): number {
  if (!Number.isFinite(actual) || !Number.isFinite(baseline) || baseline === 0) {
    return 0;
  }
  return (actual - baseline) / Math.abs(baseline);
}

export function varianceDelta(actual: number, baseline: number): number {
  if (!Number.isFinite(actual) || !Number.isFinite(baseline)) return 0;
  return actual - baseline;
}

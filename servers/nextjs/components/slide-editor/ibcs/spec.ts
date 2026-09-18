/**
 * IBCS visual specs — the "complemento".
 *
 * Each visual declares which scenarios it needs and how they map to
 * SAP BW dimensions. The user only supplies the ratio (measure).
 *
 * Version codes follow KH7 CO-PA (ZBOKCOPA):
 *   #   Real / actual
 *   000 Forecast (Previsión)
 *   001 Plan / target (Objetivo)
 */

export type IbcsScenarioId = "ac" | "py" | "pl" | "fc";
export type IbcsVisualKind = "kpi_pin" | "table";
export type IbcsYearRole = "current" | "previous";
export type IbcsVersionRole = "actual" | "plan" | "forecast";

export type IbcsScenarioDef = {
  id: IbcsScenarioId;
  label: string;
  year: IbcsYearRole;
  version: IbcsVersionRole;
};

export type IbcsVisualSpec = {
  kind: IbcsVisualKind;
  pinVs: Exclude<IbcsScenarioId, "ac">;
  yearDimension: string;
  versionDimension: string;
  versionCodes: Record<IbcsVersionRole, string>;
  scenarios: IbcsScenarioDef[];
};

export const IBCS_KPI_PIN: IbcsVisualSpec = {
  kind: "kpi_pin",
  pinVs: "fc",
  yearDimension: "0CALYEAR",
  versionDimension: "0VERSION",
  versionCodes: {
    actual: "#",
    forecast: "000",
    plan: "001",
  },
  scenarios: [
    { id: "ac", label: "AC AY", year: "current", version: "actual" },
    { id: "py", label: "ΔPY", year: "previous", version: "actual" },
    { id: "fc", label: "ΔFC", year: "current", version: "forecast" },
    { id: "pl", label: "ΔPL", year: "current", version: "plan" },
  ],
};

export const IBCS_TABLE: IbcsVisualSpec = {
  ...IBCS_KPI_PIN,
  kind: "table",
};

export const IBCS_VISUALS: Record<IbcsVisualKind, IbcsVisualSpec> = {
  kpi_pin: IBCS_KPI_PIN,
  table: IBCS_TABLE,
};

export type IbcsScenarioValues = {
  ac: number;
  py: number;
  pl: number;
  fc: number;
};

/** Demo numbers matching the first KPI pin mock (25,6M vs FC -2,7%). */
export const IBCS_KPI_PIN_EXAMPLE: IbcsScenarioValues = {
  ac: 25_600_000,
  py: 24_474_187,
  pl: 27_032_735,
  fc: 26_320_700,
};

export function isIbcsChartType(value: unknown): value is "ibcs_kpi" {
  return value === "ibcs_kpi";
}

export function specForKind(kind: IbcsVisualKind | null | undefined): IbcsVisualSpec {
  return IBCS_VISUALS[kind ?? "kpi_pin"] ?? IBCS_KPI_PIN;
}

export type IbcsConfigLike = {
  kind?: IbcsVisualKind | null;
  pin_vs?: Exclude<IbcsScenarioId, "ac"> | null;
  measure?: string | null;
  current_year?: string | null;
  values?: IbcsScenarioValues | null;
  row_dimension?: string | null;
  columns?: Array<{
    id: string;
    role:
      | "label"
      | "py"
      | "pl"
      | "fc"
      | "ac"
      | "delta_py"
      | "pct_py"
      | "delta_pl"
      | "pct_pl"
      | "delta_fc"
      | "pct_fc";
    viz: "text" | "number" | "bar" | "variance" | "variance_hatched" | "percent";
    label: string;
    visible?: boolean;
  }> | null;
  members?: Array<{
    code: string;
    caption: string;
    ac: number;
    py: number;
    pl: number;
    fc: number;
  }> | null;
  year_dimension?: string | null;
  version_dimension?: string | null;
  version_codes?: {
    actual?: string | null;
    forecast?: string | null;
    plan?: string | null;
  } | null;
  scale?: "auto" | "none" | "thousands" | "millions" | null;
  scale_label?: string | null;
  decimals?: number | null;
  unit?: string | null;
  bar_width?: number | null;
};

export const IBCS_DEFAULT_BAR_WIDTH = 14.5;

export function specFromConfig(
  config?: IbcsConfigLike | null,
): IbcsVisualSpec {
  const defaults = specForKind(config?.kind);
  const codes = config?.version_codes ?? {};
  const pin = config?.pin_vs;
  return {
    ...defaults,
    pinVs: pin === "py" || pin === "pl" || pin === "fc" ? pin : defaults.pinVs,
    yearDimension:
      String(config?.year_dimension ?? "").trim() || defaults.yearDimension,
    versionDimension:
      String(config?.version_dimension ?? "").trim() || defaults.versionDimension,
    versionCodes: {
      actual: String(codes.actual ?? "").trim() || defaults.versionCodes.actual,
      forecast:
        String(codes.forecast ?? "").trim() || defaults.versionCodes.forecast,
      plan: String(codes.plan ?? "").trim() || defaults.versionCodes.plan,
    },
  };
}

export function mergeIbcsConfig(
  current: IbcsConfigLike | null | undefined,
  patch: IbcsConfigLike,
): IbcsConfigLike & { kind: IbcsVisualKind; pin_vs: Exclude<IbcsScenarioId, "ac"> } {
  const spec = specFromConfig({ ...current, ...patch });
  const versionCodes = {
    ...(current?.version_codes ?? {}),
    ...(patch.version_codes ?? {}),
  };
  const kind = patch.kind ?? current?.kind ?? "kpi_pin";
  return {
    ...current,
    ...patch,
    kind: kind === "table" ? "table" : "kpi_pin",
    pin_vs: spec.pinVs,
    version_codes:
      Object.keys(versionCodes).length > 0 ? versionCodes : current?.version_codes,
  };
}

export function clampIbcsBarWidth(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return IBCS_DEFAULT_BAR_WIDTH;
  return Math.min(28, Math.max(8, parsed));
}

export function previousYear(currentYear: string): string {
  const year = Number.parseInt(currentYear, 10);
  if (!Number.isFinite(year)) return currentYear;
  return String(year - 1);
}

export function resolveCurrentYear(preferred?: string | null): string {
  const raw = String(preferred ?? "").trim();
  if (/^\d{4}$/.test(raw)) return raw;
  return String(new Date().getFullYear());
}

export function scenarioFilters(
  spec: IbcsVisualSpec,
  scenario: IbcsScenarioDef,
  currentYear: string,
): Array<{ dimension: string; values: string[] }> {
  const year =
    scenario.year === "previous" ? previousYear(currentYear) : currentYear;
  return [
    { dimension: spec.yearDimension, values: [year] },
    {
      dimension: spec.versionDimension,
      values: [spec.versionCodes[scenario.version]],
    },
  ];
}

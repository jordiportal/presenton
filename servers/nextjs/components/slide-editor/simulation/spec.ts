import type {
  SimulationColumn,
  SimulationColumnPref,
  SimulationConfig,
  SimulationSnapshot,
} from "@/components/slide-editor/types";
import type { SimulationFormatOptions } from "@/components/slide-editor/simulation/format";

export const SIMULATION_PACK = "plan-ventas.v1";

/** Mirror of the backend ``plan-ventas.v1`` column pack (services/simulation_engine.py). */
export const PLAN_VENTAS_V1_COLUMNS: SimulationColumn[] = [
  { id: "label", label: "", kind: "label", format: "text" },
  { id: "uds_ly", label: "UDS LY", kind: "source", format: "number" },
  { id: "uds_ay", label: "UDS AY R/P", kind: "source", format: "number" },
  { id: "incr_uds_pct", label: "Incr. UDS %", kind: "input", format: "percent" },
  { id: "simu_uds", label: "Simu UDS", kind: "calc", format: "number" },
  { id: "dif_uds", label: "Dif UDS", kind: "calc", format: "number" },
  { id: "vn_un", label: "VN UN", kind: "input", format: "number" },
  { id: "incr_vn_pct", label: "Incr. VN %", kind: "input", format: "percent" },
  { id: "simu_vn_un", label: "Simu VN UN", kind: "calc", format: "number" },
  { id: "simu_venta", label: "Simu Venta", kind: "calc", format: "number" },
];

/** Band colors by column role — source blue, input orange, calc yellow. */
export const SIMULATION_BAND_COLORS: Record<string, string> = {
  label: "#FFFFFF",
  source: "#EFF6FF",
  input: "#FFF4E6",
  calc: "#FEFCE8",
};

export const SIMULATION_HEADER_COLORS: Record<string, string> = {
  label: "#F2F4F7",
  source: "#DBEAFE",
  input: "#FFE4C4",
  calc: "#FEF3C7",
};

export function simulationColumnsFor(pack?: string | null): SimulationColumn[] {
  // Only one pack for now; keep the switch for future packs.
  void pack;
  return PLAN_VENTAS_V1_COLUMNS.map((column) => ({ ...column }));
}

/** Demo matrix so a freshly inserted visual renders before any KH7 fetch. */
export function exampleSimulationSnapshot(): SimulationSnapshot {
  const columns = simulationColumnsFor(SIMULATION_PACK);
  const seed: Array<[string, number, number, number, number]> = [
    ["PA STANDARD 500", 128_000, 132_000, 0.05, 1.42],
    ["Desincrustante", 74_500, 78_200, 0.08, 0.98],
    ["UNILEVER 250", 51_300, 49_800, -0.02, 2.11],
    ["Lavavajillas", 96_100, 101_400, 0.06, 1.27],
    ["Ambientadores", 42_800, 45_600, 0.09, 1.85],
  ];
  const rows = seed.map(([label, ly, ay, incr, vnun]) => {
    const simuUds = ay * (1 + incr);
    const simuVenta = simuUds * vnun;
    return {
      row_key: label,
      label,
      values: {
        uds_ly: ly,
        uds_ay: ay,
        incr_uds_pct: incr,
        simu_uds: simuUds,
        dif_uds: simuUds - ay,
        vn_un: vnun,
        incr_vn_pct: 0,
        simu_vn_un: vnun,
        simu_venta: simuVenta,
      },
    };
  });
  const totals: Record<string, number> = {};
  for (const column of columns) {
    if (column.kind === "label") continue;
    totals[column.id] = rows.reduce(
      (sum, row) => sum + (row.values[column.id] ?? 0),
      0,
    );
  }
  const udsAy = totals.uds_ay || 0;
  totals.incr_uds_pct = udsAy ? (totals.simu_uds - udsAy) / udsAy : 0;
  totals.vn_un = totals.simu_uds ? totals.simu_venta / totals.simu_uds : 0;
  totals.incr_vn_pct = 0;
  totals.simu_vn_un = totals.vn_un;
  return { pack: SIMULATION_PACK, columns, rows, totals };
}

export function defaultSimulationConfig(): SimulationConfig {
  return {
    pack: SIMULATION_PACK,
    workbook_id: null,
    spec: {
      source_query: null,
      row_dimensions: [],
      uds_measure: null,
      vn_measure: null,
      year_dimension: "0CALYEAR",
      version_dimension: "0VERSION",
      version_actual: "#",
      current_year: String(new Date().getFullYear()),
      incr_query: null,
      incr_row_dimension: null,
      incr_uds_measure: null,
      incr_vn_measure: null,
      filters: [],
      max_rows: 60,
    },
    snapshot: exampleSimulationSnapshot(),
    unit: null,
    decimals: 0,
  };
}

/** Build the default column preferences (all visible, pack order). */
export function defaultSimulationColumnPrefs(
  columns: SimulationColumn[],
): SimulationColumnPref[] {
  return columns.map((column) => ({
    id: column.id,
    label: column.label,
    visible: true,
  }));
}

/**
 * Apply user column preferences (order, label override, visibility) to the
 * snapshot columns. The label column is always kept first and visible.
 */
export function resolveDisplayColumns(
  columns: SimulationColumn[],
  prefs?: SimulationColumnPref[] | null,
): SimulationColumn[] {
  if (!prefs?.length) return columns;
  const byId = new Map(columns.map((column) => [column.id, column]));
  const seen = new Set<string>();
  const ordered: SimulationColumn[] = [];
  for (const pref of prefs) {
    const column = byId.get(pref.id);
    if (!column || seen.has(pref.id)) continue;
    seen.add(pref.id);
    if (column.kind !== "label" && pref.visible === false) continue;
    ordered.push({ ...column, label: pref.label ?? column.label });
  }
  // Append any pack columns missing from prefs (robust to pack changes).
  for (const column of columns) {
    if (!seen.has(column.id)) ordered.push(column);
  }
  // Guarantee the label column leads the table.
  const labelIndex = ordered.findIndex((column) => column.kind === "label");
  if (labelIndex > 0) {
    const [label] = ordered.splice(labelIndex, 1);
    ordered.unshift(label);
  }
  return ordered;
}

/** Format options derived from a simulation config. */
export function simulationFormatFromConfig(
  config?: Pick<
    SimulationConfig,
    "decimals" | "unit" | "scale" | "scale_label"
  > | null,
): SimulationFormatOptions {
  return {
    decimals: config?.decimals ?? null,
    unit: config?.unit ?? null,
    scale: config?.scale ?? "none",
    scaleLabel: config?.scale_label ?? null,
  };
}

/** Flatten a snapshot into a plain string grid (fallback for non-visual export paths). */
export function simulationSnapshotToGrid(
  snapshot: SimulationSnapshot | null | undefined,
  prefs?: SimulationColumnPref[] | null,
): string[][] {
  const columns = resolveDisplayColumns(
    snapshot?.columns?.length
      ? snapshot.columns
      : simulationColumnsFor(snapshot?.pack),
    prefs,
  );
  const header = columns.map((column) =>
    column.kind === "label" ? "" : column.label || column.id,
  );
  const format = (column: SimulationColumn, value: number): string => {
    if (column.format === "percent") {
      return `${Math.round(value * 1000) / 10}%`;
    }
    const decimals = column.id === "vn_un" || column.id === "simu_vn_un" ? 2 : 0;
    return new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  };
  const body = (snapshot?.rows ?? []).map((row) =>
    columns.map((column) =>
      column.kind === "label"
        ? row.label || row.row_key
        : format(column, Number(row.values?.[column.id] ?? 0)),
    ),
  );
  const totals = snapshot?.totals ?? {};
  const totalRow = columns.map((column) =>
    column.kind === "label"
      ? "Total"
      : format(column, Number(totals[column.id] ?? 0)),
  );
  return [header, ...body, ...(body.length ? [totalRow] : [])];
}

export function isSimulationConfig(value: unknown): value is SimulationConfig {
  return (
    !!value &&
    typeof value === "object" &&
    "pack" in (value as Record<string, unknown>)
  );
}

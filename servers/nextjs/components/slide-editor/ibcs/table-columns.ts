import { formatIbcsNumber, formatPercent, varianceRatio } from "./format.ts";
import type { IbcsFormatOptions } from "./format.ts";
import type { IbcsScenarioValues } from "./spec.ts";

export type IbcsTableViz =
  | "text"
  | "number"
  | "bar"
  | "variance"
  | "variance_hatched"
  | "percent";

export type IbcsTableRole =
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

export type IbcsTableColumn = {
  id: string;
  role: IbcsTableRole;
  viz: IbcsTableViz;
  label: string;
  visible?: boolean;
};

export type IbcsTableMember = {
  code: string;
  caption: string;
  ac: number;
  py: number;
  pl: number;
  fc: number;
};

export const IBCS_TABLE_TOTAL_CODE = "__total__";

export const IBCS_TABLE_COLUMNS: IbcsTableColumn[] = [
  { id: "label", role: "label", viz: "text", label: "" },
  { id: "py", role: "py", viz: "number", label: "PY" },
  { id: "pl", role: "pl", viz: "number", label: "PL" },
  { id: "fc", role: "fc", viz: "number", label: "FC" },
  { id: "ac", role: "ac", viz: "bar", label: "AC" },
  { id: "delta_py", role: "delta_py", viz: "variance", label: "ΔPY" },
  { id: "pct_py", role: "pct_py", viz: "percent", label: "ΔPY%" },
  { id: "delta_pl", role: "delta_pl", viz: "variance", label: "ΔPL" },
  { id: "pct_pl", role: "pct_pl", viz: "percent", label: "ΔPL%" },
  { id: "delta_fc", role: "delta_fc", viz: "variance_hatched", label: "ΔFC" },
  { id: "pct_fc", role: "pct_fc", viz: "percent", label: "ΔFC%" },
];

export const IBCS_TABLE_VIZ_OPTIONS: Array<{ value: IbcsTableViz; label: string }> = [
  { value: "number", label: "Número" },
  { value: "bar", label: "Barra (gráfico)" },
  { value: "variance", label: "Indicador Δ" },
  { value: "variance_hatched", label: "Indicador Δ rayado" },
  { value: "percent", label: "Porcentaje" },
  { value: "text", label: "Texto" },
];

export function defaultIbcsTableColumns(): IbcsTableColumn[] {
  return IBCS_TABLE_COLUMNS.map((item) => ({ ...item, visible: true }));
}

export function visibleIbcsTableColumns(
  columns?: IbcsTableColumn[] | null,
): IbcsTableColumn[] {
  const list = columns?.length ? columns : defaultIbcsTableColumns();
  return list.filter((item) => item.visible !== false);
}

export function withIbcsTableTotal(
  members: IbcsTableMember[],
): IbcsTableMember[] {
  const body = members.filter((item) => item.code !== IBCS_TABLE_TOTAL_CODE);
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
  return [total, ...body];
}

export function ibcsTableNumericValue(
  role: IbcsTableRole,
  member: IbcsScenarioValues,
): number {
  if (role === "py") return member.py;
  if (role === "pl") return member.pl;
  if (role === "fc") return member.fc;
  if (role === "ac") return member.ac;
  if (role === "delta_py") return member.ac - member.py;
  if (role === "delta_pl") return member.ac - member.pl;
  if (role === "delta_fc") return member.ac - member.fc;
  if (role === "pct_py") return varianceRatio(member.ac, member.py);
  if (role === "pct_pl") return varianceRatio(member.ac, member.pl);
  if (role === "pct_fc") return varianceRatio(member.ac, member.fc);
  return 0;
}

export function formatIbcsTableCell(
  column: IbcsTableColumn,
  member: IbcsTableMember,
  format: IbcsFormatOptions = {},
): string {
  if (column.role === "label") return member.caption;
  if (column.viz === "percent" || column.role.startsWith("pct_")) {
    return formatPercent(ibcsTableNumericValue(column.role, member));
  }
  return formatIbcsNumber(ibcsTableNumericValue(column.role, member), format);
}

export function ibcsTableToGrid(
  members: IbcsTableMember[],
  columns?: IbcsTableColumn[] | null,
  format: IbcsFormatOptions = {},
): string[][] {
  const cols = visibleIbcsTableColumns(columns);
  const header = cols.map((item) => item.label || item.role.toUpperCase());
  const rows = withIbcsTableTotal(members).map((member) =>
    cols.map((column) => formatIbcsTableCell(column, member, format)),
  );
  return [header, ...rows];
}

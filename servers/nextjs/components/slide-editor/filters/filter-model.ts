import type {
  DataBinding,
  FilterElement,
  FilterOption,
  FilterWidgetKind,
  Kh7FilterBinding,
} from "@/components/slide-editor/types";

export const FILTER_ACCENT = "F97316";

export const MONTH_SHORT = [
  { code: "01", caption: "ene" },
  { code: "02", caption: "feb" },
  { code: "03", caption: "mar" },
  { code: "04", caption: "abr" },
  { code: "05", caption: "may" },
  { code: "06", caption: "jun" },
  { code: "07", caption: "jul" },
  { code: "08", caption: "ago" },
  { code: "09", caption: "sep" },
  { code: "10", caption: "oct" },
  { code: "11", caption: "nov" },
  { code: "12", caption: "dic" },
] as const;

export const DEFAULT_YEARS: FilterOption[] = [
  { code: "2024", caption: "2024" },
  { code: "2025", caption: "2025" },
  { code: "2026", caption: "2026" },
];

export const TIME_DIMENSIONS = new Set([
  "0CALMONTH",
  "0CALYEAR",
  "0CALWEEK",
  "ZMES",
]);

export function isFilterElement(
  value: { type?: unknown } | null | undefined,
): value is FilterElement {
  return value?.type === "filter";
}

export function filterKindLabel(kind: FilterWidgetKind) {
  switch (kind) {
    case "temporal":
      return "Meses";
    case "year":
      return "Año";
    case "radio":
      return "Radial";
    case "multi":
      return "Multiselector";
    case "dropdown":
      return "Desplegable";
    case "search":
      return "Filtro libre";
  }
}

export function defaultDimensionForKind(kind: FilterWidgetKind) {
  if (kind === "temporal") return "0CALMONTH";
  if (kind === "year") return "0CALYEAR";
  return "";
}

export function defaultOptionsForKind(kind: FilterWidgetKind): FilterOption[] {
  if (kind === "temporal") {
    return MONTH_SHORT.map((item) => ({ ...item }));
  }
  if (kind === "year") return DEFAULT_YEARS.map((item) => ({ ...item }));
  return [];
}

export function monthKey(code: string) {
  const digits = String(code ?? "").replace(/\D/g, "");
  if (digits.length >= 2) return digits.slice(-2).padStart(2, "0");
  return String(code ?? "").padStart(2, "0").slice(-2);
}

export function resolveFilterCodes(
  selected: string[],
  options: FilterOption[] | null | undefined,
  yearCodes: string[] = [],
) {
  if (selected.length === 0) return [];
  const catalog = options ?? [];
  const years = yearCodes.filter(Boolean);
  const resolved: string[] = [];

  for (const value of selected) {
    const mm = monthKey(value);
    const yearMatches = catalog.filter(
      (item) => item.code.length > 2 && monthKey(item.code) === mm,
    );
    if (/^\d{2}$/.test(mm) && (years.length > 0 || yearMatches.length > 0)) {
      const yearsToUse = years.length
        ? years
        : [...new Set(yearMatches.map((item) => item.code.slice(0, -2)))];
      if (yearsToUse.length > 0) {
        resolved.push(...yearsToUse.map((year) => `${year}${mm}`));
        continue;
      }
    }
    if (catalog.some((item) => item.code === value)) {
      resolved.push(value);
      continue;
    }
    const matches = catalog.filter(
      (item) => item.code === mm || monthKey(item.code) === mm,
    );
    if (matches.length === 0) {
      resolved.push(value);
      continue;
    }
    resolved.push(...matches.map((item) => item.code));
  }

  return [...new Set(resolved)];
}

export function mergeSlideFilters(
  binding: DataBinding,
  slideFilters: Array<{ dimension: string; values: string[] }>,
): Kh7FilterBinding[] {
  const next = new Map<string, string[]>();
  for (const item of binding.filters ?? []) {
    const dimension = item.dimension || item.column;
    if (!dimension) continue;
    const values =
      item.values?.map(String) ??
      (item.value == null ? [] : [String(item.value)]);
    if (values.length) next.set(dimension, values);
  }
  for (const item of slideFilters) {
    if (!item.dimension) continue;
    if (item.values.length === 0) next.delete(item.dimension);
    else next.set(item.dimension, item.values);
  }
  return [...next.entries()].map(([dimension, values]) => ({
    dimension,
    column: dimension,
    operator: "in",
    values,
  }));
}

export function filtersEqual(
  left: Kh7FilterBinding[] | null | undefined,
  right: Kh7FilterBinding[] | null | undefined,
) {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

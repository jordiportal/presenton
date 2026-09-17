import { Kh7Api, tableGridFromExecute } from "@/app/(presentation-generator)/services/api/kh7";
import { chartDataFromSeriesWithColors } from "@/components/slide-editor/charts/chart-data";
import { fetchIbcsScenarioValues } from "@/components/slide-editor/ibcs/fetch";
import {
  mergeIbcsConfig,
  isIbcsChartType,
  resolveCurrentYear,
  specFromConfig,
  type IbcsConfigLike,
} from "@/components/slide-editor/ibcs/spec";
import { parseIbcsDecimals } from "@/components/slide-editor/ibcs/format";
import { chartFromIbcsValues } from "@/components/slide-editor/ibcs/values";
import {
  filtersEqual,
  isFilterElement,
  mergeSlideFilters,
  resolveFilterCodes,
} from "@/components/slide-editor/filters/filter-model";
import {
  setTableRowsFromStrings,
} from "@/components/slide-editor/model/element-model";
import {
  ROOT_ELEMENTS_COMPONENT_INDEX,
  asRecord,
  readArray,
  readString,
  updateElementInUi,
  type ElementSelection,
  type RawElement,
  type RawUi,
} from "@/components/slide-editor/model/model";
import type {
  DataBinding,
  FilterElement,
  Kh7FilterBinding,
  TableElement,
} from "@/components/slide-editor/types";

type BoundTarget = {
  selection: ElementSelection;
  element: RawElement;
};

export function collectFilterElements(ui: RawUi): FilterElement[] {
  return walkElements(ui)
    .map(({ element }) => element)
    .filter(isFilterElement);
}

export function slideFilterBindings(ui: RawUi): Array<{
  dimension: string;
  values: string[];
}> {
  const filters = collectFilterElements(ui);
  const yearCodes = filters
    .filter((item) => item.filter_kind === "year" && item.dimension)
    .flatMap((item) => item.selected ?? []);
  const yearsForMonths = yearCodes.length ? yearCodes : ["2026"];

  const byDimension = new Map<string, string[]>();
  for (const filter of filters) {
    const dimension = filter.dimension?.trim();
    if (!dimension) continue;
    const values = resolveFilterCodes(
      filter.selected ?? [],
      filter.options,
      filter.filter_kind === "temporal" ? yearsForMonths : [],
    );
    const current = byDimension.get(dimension) ?? [];
    byDimension.set(dimension, [...new Set([...current, ...values])]);
  }
  return [...byDimension.entries()].map(([dimension, values]) => ({
    dimension,
    values,
  }));
}

export function collectBoundTargets(ui: RawUi): BoundTarget[] {
  return walkElements(ui).filter(({ element }) => {
    const type = readString(element.type);
    if (type !== "chart" && type !== "table") return false;
    const binding = readBinding(element);
    return Boolean(binding?.query_id);
  });
}

export async function refreshBoundTargets(
  ui: RawUi,
  slideFilters: Array<{ dimension: string; values: string[] }>,
): Promise<RawUi> {
  const targets = collectBoundTargets(ui);
  if (targets.length === 0) return ui;

  let nextUi = ui;
  await Promise.all(
    targets.map(async ({ selection, element }) => {
      const binding = readBinding(element);
      if (!binding) return;
      if (binding.source === "onlyoffice") return;
      const filters = mergeSlideFilters(binding, slideFilters);
      if (
        filtersEqual(binding.filters, filters) &&
        binding.fetched_at &&
        Date.now() - Date.parse(binding.fetched_at) < 400
      ) {
        return;
      }
      try {
        const updated = await executeBoundElement(element, binding, filters);
        nextUi = updateElementInUi(nextUi, selection, () => updated);
      } catch {
        nextUi = updateElementInUi(nextUi, selection, (current) => ({
          ...current,
          data_binding: { ...binding, filters },
        }));
      }
    }),
  );
  return nextUi;
}

async function executeBoundElement(
  element: RawElement,
  binding: DataBinding,
  filters: Kh7FilterBinding[],
): Promise<RawElement> {
  const nextBinding: DataBinding = {
    ...binding,
    filters,
    fetched_at: new Date().toISOString(),
  };

  if (readString(element.type) === "chart" && isIbcsChartType(element.chart_type ?? element.chartType)) {
    const ibcs = asRecord(element.ibcs) as IbcsConfigLike | null;
    const spec = specFromConfig(ibcs);
    const yearFilter = filters.find(
      (item) => String(item.dimension || item.column || "") === spec.yearDimension,
    );
    const currentYear = resolveCurrentYear(
      yearFilter?.values?.[0] != null
        ? String(yearFilter.values[0])
        : readString(asRecord(element.ibcs)?.current_year),
    );
    const measure =
      binding.measures?.[0] ||
      readString(asRecord(element.ibcs)?.measure) ||
      "";
    if (!measure) {
      return { ...element, data_binding: nextBinding };
    }
    let knownDimensions: string[] | undefined;
    let unit = readString(ibcs?.unit);
    let decimals = parseIbcsDecimals(ibcs?.decimals);
    try {
      const meta = await Kh7Api.metadata(binding.query_id);
      knownDimensions = meta.dimensions.map((item) => item.name);
      const measureMeta = meta.measures.find((item) => item.name === measure);
      if (!unit) unit = measureMeta?.unit ?? null;
      if (decimals == null) decimals = parseIbcsDecimals(measureMeta?.decimals);
    } catch {
      knownDimensions = undefined;
    }
    const fetched = await fetchIbcsScenarioValues({
      source: binding.query_id,
      measure,
      currentYear,
      spec,
      knownDimensions,
      extraFilters: filters
        .filter((item) => (item.values?.length ?? 0) > 0)
        .map((item) => ({
          dimension: String(item.dimension || item.column || ""),
          values: (item.values ?? []).map(String),
        })),
    });
    const values = fetched.values;
    if (!unit) unit = fetched.unit ?? null;
    if (decimals == null) decimals = fetched.decimals ?? null;
    const grid = chartFromIbcsValues(values, measure);
    const colors = Array.isArray(element.colors)
      ? (element.colors as string[])
      : [];
    return {
      ...element,
      ...grid,
      data: chartDataFromSeriesWithColors(
        grid.categories ?? [],
        grid.series ?? [],
        colors,
        true,
      ),
      ibcs: mergeIbcsConfig(ibcs, {
        kind: "kpi_pin",
        pin_vs:
          (asRecord(element.ibcs)?.pin_vs as "fc" | "pl" | "py") || "fc",
        measure,
        current_year: currentYear,
        values,
        unit,
        decimals,
        year_dimension: spec.yearDimension,
        version_dimension: spec.versionDimension,
        version_codes: spec.versionCodes,
      }),
      data_binding: nextBinding,
    };
  }

  const result = await Kh7Api.execute({
    source: binding.query_id,
    dimensions: binding.dimensions ?? [],
    column_dimensions: binding.column_dimensions ?? [],
    measures: binding.measures ?? [],
    filters: filters
      .filter((item) => (item.values?.length ?? 0) > 0)
      .map((item) => ({
        dimension: String(item.dimension || item.column || ""),
        values: (item.values ?? []).map(String),
      })),
  });

  if (readString(element.type) === "chart") {
    const categories = result.chart.categories ?? [];
    const series = (result.chart.series ?? []).map((item) => ({
      name: item.name,
      values: item.values,
    }));
    const colors = Array.isArray(element.colors)
      ? (element.colors as string[])
      : [];
    return {
      ...element,
      categories,
      series,
      data: chartDataFromSeriesWithColors(categories, series, colors, series.length <= 1),
      data_binding: nextBinding,
    };
  }

  const grid = tableGridFromExecute(result);
  const table = setTableRowsFromStrings(element as unknown as TableElement, [
    grid.columns,
    ...grid.rows,
  ]);
  return {
    ...element,
    ...table,
    type: "table",
    data_binding: nextBinding,
    max_columns: Math.max(
      Number(element.max_columns) || 16,
      grid.columns.length,
    ),
    max_rows: Math.max(Number(element.max_rows) || 24, grid.rows.length + 1),
  };
}

function readBinding(element: RawElement): DataBinding | null {
  const raw = asRecord(element.data_binding);
  if (!raw) return null;
  const queryId = readString(raw.query_id);
  if (!queryId) return null;
  return raw as unknown as DataBinding;
}

function walkElements(ui: RawUi): BoundTarget[] {
  const found: BoundTarget[] = [];
  const visit = (
    elements: unknown[],
    componentIndex: number,
    parentPath: number[],
  ) => {
    elements.forEach((item, index) => {
      const element = asRecord(item);
      if (!element) return;
      const elementPath = [...parentPath, index];
      found.push({
        selection: { kind: "element", componentIndex, elementPath },
        element,
      });
      const children = readArray(element.children);
      if (children.length) visit(children, componentIndex, elementPath);
      const child = asRecord(element.child);
      if (child) visit([child], componentIndex, elementPath);
    });
  };

  visit(readArray(ui.elements), ROOT_ELEMENTS_COMPONENT_INDEX, []);
  readArray(ui.components).forEach((component, componentIndex) => {
    const record = asRecord(component);
    if (!record) return;
    visit(readArray(record.elements), componentIndex, []);
  });
  return found;
}

import { Kh7Api, tableGridFromExecute } from "@/app/(presentation-generator)/services/api/kh7";
import { chartDataFromSeriesWithColors } from "@/components/slide-editor/charts/chart-data";
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
  const nextBinding: DataBinding = {
    ...binding,
    filters,
    fetched_at: new Date().toISOString(),
  };

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

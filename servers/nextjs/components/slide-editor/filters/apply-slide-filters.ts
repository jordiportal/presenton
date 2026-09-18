import { Kh7Api, tableGridFromExecute } from "@/app/(presentation-generator)/services/api/kh7";
import { chartDataFromSeriesWithColors } from "@/components/slide-editor/charts/chart-data";
import {
  fetchIbcsScenarioValues,
  fetchIbcsTableMembers,
} from "@/components/slide-editor/ibcs/fetch";
import {
  mergeIbcsConfig,
  isIbcsChartType,
  isIbcsColumnChartType,
  resolveCurrentYear,
  specFromConfig,
  type IbcsConfigLike,
} from "@/components/slide-editor/ibcs/spec";
import {
  ibcsFormatFromConfig,
  parseIbcsDecimals,
} from "@/components/slide-editor/ibcs/format";
import {
  ibcsTableToGrid,
  type IbcsTableColumn,
} from "@/components/slide-editor/ibcs/table-columns";
import { chartFromIbcsValues } from "@/components/slide-editor/ibcs/values";
import {
  filtersEqual,
  isFilterElement,
  isTreemapFilter,
  isYearMonthDimension,
  mergeSlideFilters,
  resolveFilterCodes,
} from "@/components/slide-editor/filters/filter-model";
import {
  findTreemapNode,
  flattenTreemapNodes,
} from "@/components/slide-editor/filters/treemap-layout";
import { buildTreemapNodes } from "@/components/slide-editor/filters/treemap-data";
import {
  setTableRowsFromStrings,
} from "@/components/slide-editor/model/element-model";
import { SimulationApi } from "@/components/slide-editor/simulation/api";
import { simulationSnapshotToGrid } from "@/components/slide-editor/simulation/spec";
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
  const yearsForMonths = yearCodes.length
    ? yearCodes
    : [String(new Date().getFullYear())];

  const byDimension = new Map<string, string[]>();
  for (const filter of filters) {
    if (isTreemapFilter(filter)) {
      const selected = filter.selected ?? [];
      if (!selected.length) continue;
      const node = findTreemapNode(filter.nodes, selected[0]);
      const parentDim = filter.dimension?.trim();
      const childDim = filter.child_dimension?.trim();
      if (node?.parentCode && childDim && parentDim) {
        const parentValues = byDimension.get(parentDim) ?? [];
        byDimension.set(parentDim, [...new Set([...parentValues, node.parentCode])]);
        const childValues = byDimension.get(childDim) ?? [];
        byDimension.set(childDim, [...new Set([...childValues, node.code])]);
        continue;
      }
      const dimension = parentDim;
      if (!dimension) continue;
      const current = byDimension.get(dimension) ?? [];
      byDimension.set(dimension, [...new Set([...current, ...selected])]);
      continue;
    }
    const dimension = filter.dimension?.trim();
    if (!dimension) continue;
    const composeYear =
      filter.filter_kind === "temporal" &&
      isYearMonthDimension(dimension);
    const values = resolveFilterCodes(
      filter.selected ?? [],
      filter.options,
      composeYear ? yearsForMonths : [],
      dimension,
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
    if (type === "filter" && isTreemapFilter(element)) {
      const binding = readBinding(element);
      return Boolean(binding?.query_id || readString(element.source));
    }
    if (type !== "chart" && type !== "table") return false;
    if (type === "table") {
      const workbookId = readString(asRecord(element.simulation)?.workbook_id);
      if (workbookId) return true;
    }
    const binding = readBinding(element);
    return Boolean(binding?.query_id);
  });
}

function simulationWorkbookId(element: RawElement): string | null {
  if (readString(element.type) !== "table") return null;
  return readString(asRecord(element.simulation)?.workbook_id);
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
      const workbookId = simulationWorkbookId(element);
      if (workbookId) {
        try {
          const updated = await refreshSimulationElement(
            element,
            workbookId,
            slideFilters,
          );
          nextUi = updateElementInUi(nextUi, selection, () => updated);
        } catch (err) {
          console.error("No se pudo aplicar el filtro a la simulación", {
            workbookId,
            err,
          });
        }
        return;
      }
      const binding =
        readBinding(element) ??
        (isTreemapFilter(element) ? treemapBindingFromElement(element) : null);
      if (!binding) return;
      if (binding.source === "onlyoffice") return;
      const filters = mergeSlideFilters(
        binding,
        isTreemapFilter(element)
          ? slideFilters.filter((item) => {
              const dim = item.dimension;
              return (
                dim &&
                dim !== readString(element.dimension) &&
                dim !== readString(element.child_dimension) &&
                !(binding.dimensions ?? []).includes(dim)
              );
            })
          : slideFilters,
      );
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
      } catch (err) {
        console.error("No se pudo aplicar el filtro BIW", {
          query: binding.query_id,
          filters,
          err,
        });
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

  if (isTreemapFilter(element)) {
    const source = binding.query_id || readString(element.source) || "";
    const parentDim = binding.dimensions?.[0] || readString(element.dimension) || "";
    const childDim =
      binding.dimensions?.[1] || readString(element.child_dimension) || "";
    const measure =
      binding.measures?.[0] || readString(element.measure) || "";
    if (!source || !parentDim || !measure) {
      return { ...element, data_binding: nextBinding };
    }
    const dims = childDim ? [parentDim, childDim] : [parentDim];
    const cubeFilters = filters
      .filter((item) => (item.values?.length ?? 0) > 0)
      .map((item) => ({
        dimension: String(item.dimension || item.column || ""),
        values: (item.values ?? []).map(String),
      }));
    const [result, parentValues, childValues] = await Promise.all([
      Kh7Api.execute({
        source,
        dimensions: dims,
        measures: [measure],
        filters: cubeFilters,
      }),
      Kh7Api.dimensionValues(source, parentDim).catch(() => []),
      childDim ? Kh7Api.dimensionValues(source, childDim).catch(() => []) : Promise.resolve([]),
    ]);
    const nodes = buildTreemapNodes(result, {
      hasChild: Boolean(childDim),
      parentValues,
      childValues,
    });
    const selected = (Array.isArray(element.selected) ? element.selected : [])
      .map(String)
      .filter((code) => Boolean(findTreemapNode(nodes, code)));
    return {
      ...element,
      type: "filter",
      nodes,
      options: flattenTreemapNodes(nodes).map((item) => ({
        code: item.code,
        caption: item.caption,
      })),
      selected,
      data_binding: {
        ...nextBinding,
        query_id: source,
        dimensions: dims,
        measures: [measure],
      },
    };
  }

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

  if (
    readString(element.type) === "chart" &&
    isIbcsColumnChartType(element.chart_type ?? element.chartType)
  ) {
    const ibcs = asRecord(element.ibcs) as IbcsConfigLike | null;
    const spec = specFromConfig({ ...ibcs, kind: "column" });
    const yearFilter = filters.find(
      (item) => String(item.dimension || item.column || "") === spec.yearDimension,
    );
    const currentYear = resolveCurrentYear(
      yearFilter?.values?.[0] != null
        ? String(yearFilter.values[0])
        : readString(ibcs?.current_year),
    );
    const measure = binding.measures?.[0] || readString(ibcs?.measure) || "";
    const rowDimension =
      binding.dimensions?.[0] || readString(ibcs?.row_dimension) || "";
    if (!measure || !rowDimension) {
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
    const fetched = await fetchIbcsTableMembers({
      source: binding.query_id,
      measure,
      currentYear,
      rowDimension,
      spec,
      knownDimensions,
      extraFilters: filters
        .filter((item) => (item.values?.length ?? 0) > 0)
        .map((item) => ({
          dimension: String(item.dimension || item.column || ""),
          values: (item.values ?? []).map(String),
        })),
    });
    if (!unit) unit = fetched.unit ?? null;
    if (decimals == null) decimals = fetched.decimals ?? null;
    const nextIbcs = mergeIbcsConfig(ibcs, {
      kind: "column",
      measure,
      current_year: currentYear,
      row_dimension: rowDimension,
      members: fetched.members,
      unit,
      decimals,
      year_dimension: spec.yearDimension,
      version_dimension: spec.versionDimension,
      version_codes: spec.versionCodes,
    });
    const categories = fetched.members.map((item) => item.caption);
    const series = [{ name: measure, values: fetched.members.map((item) => item.ac) }];
    const colors = Array.isArray(element.colors)
      ? (element.colors as string[])
      : [];
    return {
      ...element,
      categories,
      series,
      data: chartDataFromSeriesWithColors(categories, series, colors, true),
      ibcs: nextIbcs,
      data_binding: {
        ...nextBinding,
        dimensions: [rowDimension],
        measures: [measure],
      },
    };
  }

  if (
    readString(element.type) === "table" &&
    asRecord(element.ibcs)?.kind === "table"
  ) {
    const ibcs = asRecord(element.ibcs) as IbcsConfigLike | null;
    const spec = specFromConfig({ ...ibcs, kind: "table" });
    const yearFilter = filters.find(
      (item) => String(item.dimension || item.column || "") === spec.yearDimension,
    );
    const currentYear = resolveCurrentYear(
      yearFilter?.values?.[0] != null
        ? String(yearFilter.values[0])
        : readString(ibcs?.current_year),
    );
    const measure =
      binding.measures?.[0] || readString(ibcs?.measure) || "";
    const rowDimension =
      binding.dimensions?.[0] || readString(ibcs?.row_dimension) || "";
    if (!measure || !rowDimension) {
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
    const fetched = await fetchIbcsTableMembers({
      source: binding.query_id,
      measure,
      currentYear,
      rowDimension,
      spec,
      knownDimensions,
      extraFilters: filters
        .filter((item) => (item.values?.length ?? 0) > 0)
        .map((item) => ({
          dimension: String(item.dimension || item.column || ""),
          values: (item.values ?? []).map(String),
        })),
      maxRows: Math.max(1, (Number(element.max_rows) || 24) - 1),
    });
    if (!unit) unit = fetched.unit ?? null;
    if (decimals == null) decimals = fetched.decimals ?? null;
    const nextIbcs = mergeIbcsConfig(ibcs, {
      kind: "table",
      measure,
      current_year: currentYear,
      row_dimension: rowDimension,
      members: fetched.members,
      columns: ibcs?.columns,
      unit,
      decimals,
      year_dimension: spec.yearDimension,
      version_dimension: spec.versionDimension,
      version_codes: spec.versionCodes,
    });
    const grid = ibcsTableToGrid(
      fetched.members,
      nextIbcs.columns as IbcsTableColumn[] | null | undefined,
      ibcsFormatFromConfig(nextIbcs),
    );
    const table = setTableRowsFromStrings(element as unknown as TableElement, grid);
    return {
      ...element,
      ...table,
      type: "table",
      ibcs: nextIbcs,
      data_binding: {
        ...nextBinding,
        dimensions: [rowDimension],
        measures: [measure],
      },
      max_columns: Math.max(
        Number(element.max_columns) || 16,
        grid[0]?.length ?? 0,
      ),
      max_rows: Math.max(Number(element.max_rows) || 24, grid.length),
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

async function refreshSimulationElement(
  element: RawElement,
  workbookId: string,
  slideFilters: Array<{ dimension: string; values: string[] }>,
): Promise<RawElement> {
  const simulation = asRecord(element.simulation) ?? {};
  const specRecord = asRecord(simulation.spec) ?? {};
  const rowDimensions = readArray(specRecord.row_dimensions).map(String);
  // Slide filters clip the fetch, but never the visual's own grouping dimension.
  const filters = slideFilters
    .filter(
      (item) =>
        item.dimension &&
        !rowDimensions.includes(item.dimension) &&
        (item.values?.length ?? 0) > 0,
    )
    .map((item) => ({
      dimension: item.dimension,
      values: item.values.map(String),
    }));
  const nextSpec = { ...specRecord, filters };
  const snapshot = await SimulationApi.refresh({
    workbook_id: workbookId,
    pack: readString(simulation.pack) || "plan-ventas.v1",
    spec: nextSpec as never,
  });
  const grid = simulationSnapshotToGrid(snapshot);
  const table =
    grid.length > 0
      ? setTableRowsFromStrings(element as unknown as TableElement, grid)
      : {};
  return {
    ...element,
    ...table,
    type: "table",
    simulation: {
      ...simulation,
      spec: nextSpec,
      workbook_id: snapshot.workbook_id ?? workbookId,
      snapshot,
    },
  };
}

function readBinding(element: RawElement): DataBinding | null {
  const raw = asRecord(element.data_binding);
  if (!raw) return null;
  const queryId = readString(raw.query_id);
  if (!queryId) return null;
  return raw as unknown as DataBinding;
}

function treemapBindingFromElement(element: RawElement): DataBinding | null {
  const source = readString(element.source);
  const measure = readString(element.measure);
  const dimension = readString(element.dimension);
  if (!source || !measure || !dimension) return null;
  const child = readString(element.child_dimension);
  return {
    source: "kh7",
    query_id: source,
    dimensions: child ? [dimension, child] : [dimension],
    measures: [measure],
    filters: [],
  };
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

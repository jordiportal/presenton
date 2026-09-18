import { Kh7Api, type CubeFilter, type Kh7Measure } from "@/app/(presentation-generator)/services/api/kh7";
import type { IbcsTableMember } from "@/components/slide-editor/ibcs/table-columns";
import { parseIbcsDecimals } from "@/components/slide-editor/ibcs/format";
import {
  IBCS_KPI_PIN,
  scenarioFilters,
  specForKind,
  specFromConfig,
  type IbcsConfigLike,
  type IbcsScenarioValues,
  type IbcsVisualKind,
  type IbcsVisualSpec,
} from "@/components/slide-editor/ibcs/spec";

export type IbcsFetchResult = {
  values: IbcsScenarioValues;
  unit?: string | null;
  decimals?: number | null;
};

function isVisualSpec(
  value: IbcsVisualSpec | IbcsConfigLike | null | undefined,
): value is IbcsVisualSpec {
  return Boolean(value && "yearDimension" in value && "scenarios" in value);
}

function formatFromMeasures(
  measures: Kh7Measure[] | undefined,
  name: string,
): { unit?: string | null; decimals?: number | null } {
  const match = measures?.find((item) => item.name === name);
  if (!match) return {};
  return {
    unit: match.unit ?? null,
    decimals: parseIbcsDecimals(match.decimals),
  };
}

export async function fetchIbcsScenarioValues(input: {
  source: string;
  measure: string;
  currentYear: string;
  kind?: IbcsVisualKind;
  spec?: IbcsVisualSpec | IbcsConfigLike | null;
  extraFilters?: CubeFilter[];
  knownDimensions?: string[];
}): Promise<IbcsFetchResult> {
  const spec = isVisualSpec(input.spec)
    ? input.spec
    : specFromConfig(input.spec ?? { kind: input.kind });
  const known = new Set(input.knownDimensions ?? []);
  const extra = (input.extraFilters ?? []).filter((item) => {
    const dim = item.dimension;
    return (
      dim &&
      dim !== spec.yearDimension &&
      dim !== spec.versionDimension &&
      (item.values?.length ?? 0) > 0 &&
      (known.size === 0 || known.has(dim))
    );
  });
  const axis =
    known.size === 0 || known.has(spec.yearDimension)
      ? spec.yearDimension
      : [...known][0];

  const entries = await Promise.all(
    spec.scenarios.map(async (scenario) => {
      const scenarioOnly = scenarioFilters(spec, scenario, input.currentYear).filter(
        (item) => known.size === 0 || known.has(item.dimension),
      );
      const result = await Kh7Api.execute({
        source: input.source,
        dimensions: [axis],
        measures: [input.measure],
        filters: [...scenarioOnly, ...extra],
      });
      const value = (result.chart.series?.[0]?.values ?? []).reduce(
        (sum, item) => sum + (Number(item) || 0),
        0,
      );
      return {
        id: scenario.id,
        value,
        unit: formatFromMeasures(result.measures, input.measure).unit,
        decimals: formatFromMeasures(result.measures, input.measure).decimals,
      };
    }),
  );

  const values: IbcsScenarioValues = { ac: 0, py: 0, pl: 0, fc: 0 };
  let unit: string | null | undefined;
  let decimals: number | null | undefined;
  for (const entry of entries) {
    values[entry.id] = entry.value;
    if (unit == null && entry.unit) unit = entry.unit;
    if (decimals == null && entry.decimals != null) decimals = entry.decimals;
  }
  return { values, unit, decimals };
}

export type IbcsTableFetchResult = {
  members: IbcsTableMember[];
  unit?: string | null;
  decimals?: number | null;
};

export async function fetchIbcsTableMembers(input: {
  source: string;
  measure: string;
  currentYear: string;
  rowDimension: string;
  spec?: IbcsVisualSpec | IbcsConfigLike | null;
  extraFilters?: CubeFilter[];
  knownDimensions?: string[];
  maxRows?: number;
}): Promise<IbcsTableFetchResult> {
  const spec = isVisualSpec(input.spec)
    ? input.spec
    : specFromConfig({ ...input.spec, kind: "table" });
  const known = new Set(input.knownDimensions ?? []);
  const extra = (input.extraFilters ?? []).filter((item) => {
    const dim = item.dimension;
    return (
      dim &&
      dim !== spec.yearDimension &&
      dim !== spec.versionDimension &&
      dim !== input.rowDimension &&
      (item.values?.length ?? 0) > 0 &&
      (known.size === 0 || known.has(dim))
    );
  });
  const axis =
    known.size === 0 || known.has(input.rowDimension)
      ? input.rowDimension
      : spec.yearDimension;

  const maps: Record<keyof IbcsScenarioValues, Map<string, number>> = {
    ac: new Map(),
    py: new Map(),
    pl: new Map(),
    fc: new Map(),
  };
  let unit: string | null | undefined;
  let decimals: number | null | undefined;

  await Promise.all(
    spec.scenarios.map(async (scenario) => {
      const scenarioOnly = scenarioFilters(spec, scenario, input.currentYear).filter(
        (item) => known.size === 0 || known.has(item.dimension),
      );
      const result = await Kh7Api.execute({
        source: input.source,
        dimensions: [axis],
        measures: [input.measure],
        filters: [...scenarioOnly, ...extra],
      });
      const categories = result.chart.categories ?? [];
      const values = result.chart.series?.[0]?.values ?? [];
      categories.forEach((category, index) => {
        const key = String(category ?? "").trim();
        if (!key) return;
        maps[scenario.id].set(key, Number(values[index]) || 0);
      });
      const fmt = formatFromMeasures(result.measures, input.measure);
      if (unit == null && fmt.unit) unit = fmt.unit;
      if (decimals == null && fmt.decimals != null) decimals = fmt.decimals;
    }),
  );

  const keys: string[] = [];
  const seen = new Set<string>();
  for (const scenario of spec.scenarios) {
    for (const key of maps[scenario.id].keys()) {
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  const limit = Math.max(1, input.maxRows ?? 23);
  const members: IbcsTableMember[] = keys.slice(0, limit).map((caption) => ({
    code: caption,
    caption,
    ac: maps.ac.get(caption) ?? 0,
    py: maps.py.get(caption) ?? 0,
    pl: maps.pl.get(caption) ?? 0,
    fc: maps.fc.get(caption) ?? 0,
  }));
  return { members, unit, decimals };
}

export function defaultIbcsSpec() {
  return IBCS_KPI_PIN;
}

export { specForKind, specFromConfig };

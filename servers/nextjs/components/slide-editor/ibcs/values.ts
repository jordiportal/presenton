import type { ChartElement, IbcsChartConfig } from "../types";
import {
  IBCS_KPI_PIN_EXAMPLE,
  type IbcsScenarioValues,
} from "./spec";

const SCENARIO_ORDER = ["ac", "py", "pl", "fc"] as const;

export function ibcsValuesFromChart(chart: {
  ibcs?: Pick<IbcsChartConfig, "values"> | null;
  categories?: string[] | null;
  series?: Array<{ values: number[] }> | null;
}): IbcsScenarioValues {
  const stored = chart.ibcs?.values;
  if (stored && Number.isFinite(stored.ac)) {
    return {
      ac: stored.ac,
      py: stored.py,
      pl: stored.pl,
      fc: stored.fc,
    };
  }
  const values = chart.series?.[0]?.values ?? [];
  const categories = (chart.categories ?? []).map((item) =>
    String(item).trim().toLowerCase(),
  );
  const fromCategories = (id: (typeof SCENARIO_ORDER)[number], fallbackIndex: number) => {
    const index = categories.findIndex((item) => item === id);
    const value = values[index >= 0 ? index : fallbackIndex];
    return Number.isFinite(value) ? Number(value) : 0;
  };
  if (values.length >= 4) {
    return {
      ac: fromCategories("ac", 0),
      py: fromCategories("py", 1),
      pl: fromCategories("pl", 2),
      fc: fromCategories("fc", 3),
    };
  }
  return { ...IBCS_KPI_PIN_EXAMPLE };
}

export function chartFromIbcsValues(
  values: IbcsScenarioValues,
  measureName: string,
): Pick<ChartElement, "categories" | "series"> {
  return {
    categories: ["AC", "PY", "PL", "FC"],
    series: [
      {
        name: measureName,
        values: [values.ac, values.py, values.pl, values.fc],
      },
    ],
  };
}

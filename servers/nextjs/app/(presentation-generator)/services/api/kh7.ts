import { getApiUrl } from "@/utils/api";
import { getHeader } from "./header";
import { ApiResponseHandler } from "./api-error-handler";

export type Kh7Source = {
  name: string;
  description: string;
  catalog?: string;
};

export type Kh7Dimension = { name: string; caption: string };
export type Kh7Measure = {
  name: string;
  caption: string;
  unit?: string;
  decimals?: number;
};
export type Kh7DimensionValue = { code: string; caption: string };

export type Kh7Metadata = {
  source: string;
  dimensions: Kh7Dimension[];
  measures: Kh7Measure[];
  dimensionGroups: {
    name: string;
    caption: string;
    fields: { name: string; caption: string }[];
  }[];
  initialFilters: {
    dimension: string;
    caption: string;
    required: boolean;
  }[];
};

export type CubeFilter = {
  dimension: string;
  values: string[];
};

export type Kh7ExecuteResponse = {
  query_id: string;
  query_name: string;
  chart: {
    categories: string[];
    series: { name: string; values: number[] }[];
    columns: string[];
    rows: unknown[][];
  };
  table: { columns: string[]; rows: unknown[][] };
  sql: string | null;
  execution_time_ms: number;
  source: string;
  row_count: number;
};

export type Kh7TableGrid = {
  columns: string[];
  rows: string[][];
};

export function tableGridFromExecute(result: Kh7ExecuteResponse): Kh7TableGrid {
  const categories = result.chart?.categories ?? [];
  const series = result.chart?.series ?? [];
  if (categories.length > 0 && series.length > 0) {
    const axis =
      result.table?.columns?.[0] != null && result.table.columns[0] !== ""
        ? String(result.table.columns[0])
        : "Categoría";
    return {
      columns: [axis, ...series.map((item) => item.name)],
      rows: categories.map((category, index) => [
        String(category ?? ""),
        ...series.map((item) => formatTableCell(item.values?.[index])),
      ]),
    };
  }

  const columns = (result.table?.columns ?? []).map((item) => String(item ?? ""));
  const body = (result.table?.rows ?? []).map((row) =>
    (Array.isArray(row) ? row : []).map((cell) => formatTableCell(cell)),
  );
  if (
    body[0] &&
    columns.length > 0 &&
    body[0].length === columns.length &&
    body[0].every((cell, index) => cell === columns[index])
  ) {
    return { columns, rows: body.slice(1) };
  }
  return { columns, rows: body };
}

function formatTableCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value)
      ? String(value)
      : String(Math.round(value * 100) / 100);
  }
  return String(value);
}

export class Kh7Api {
  static async status(): Promise<{ configured: boolean; source?: "kh7" | "mock" }> {
    const response = await fetch(getApiUrl("/api/v1/ppt/kh7/status"), {
      headers: getHeader(),
      cache: "no-cache",
    });
    return ApiResponseHandler.handleResponse(
      response,
      "Failed to check KH7 status",
    );
  }

  static async listSources(): Promise<Kh7Source[]> {
    const response = await fetch(getApiUrl("/api/v1/ppt/kh7/sources"), {
      headers: getHeader(),
      cache: "no-cache",
    });
    const payload = await ApiResponseHandler.handleResponse(
      response,
      "Failed to load KH7 sources",
    );
    return (payload?.sources ?? []) as Kh7Source[];
  }

  static async metadata(source: string): Promise<Kh7Metadata> {
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/kh7/metadata?source=${encodeURIComponent(source)}`),
      { headers: getHeader(), cache: "no-cache" },
    );
    return ApiResponseHandler.handleResponse(
      response,
      "Failed to load source metadata",
    );
  }

  static async dimensionValues(
    source: string,
    dimension: string,
  ): Promise<Kh7DimensionValue[]> {
    const response = await fetch(
      getApiUrl(
        `/api/v1/ppt/kh7/dimension-values?source=${encodeURIComponent(source)}&dimension=${encodeURIComponent(dimension)}`,
      ),
      { headers: getHeader(), cache: "no-cache" },
    );
    const payload = await ApiResponseHandler.handleResponse(
      response,
      "Failed to load dimension values",
    );
    return (payload?.values ?? []) as Kh7DimensionValue[];
  }

  static async execute(payload: {
    source: string;
    dimensions: string[];
    column_dimensions?: string[];
    measures: string[];
    filters?: CubeFilter[];
  }): Promise<Kh7ExecuteResponse> {
    const response = await fetch(getApiUrl("/api/v1/ppt/kh7/execute"), {
      method: "POST",
      headers: getHeader(),
      body: JSON.stringify(payload),
      cache: "no-cache",
    });
    return ApiResponseHandler.handleResponse(
      response,
      "Failed to execute query",
    );
  }
}

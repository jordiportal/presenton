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

import { getApiUrl } from "@/utils/api";
import { getHeader } from "./header";
import { ApiResponseHandler } from "./api-error-handler";

export type OnlyOfficeSession = {
  editor_type?: string;
  document_name?: string;
};

export type OnlyOfficeStatus = {
  configured: boolean;
  connected: boolean;
  sessions?: OnlyOfficeSession[];
  error?: string;
};

export type OnlyOfficeReadResponse = {
  document_name?: string | null;
  sheet: string;
  range: string;
  query_id: string;
  table: { columns: string[]; rows: string[][] };
  chart: {
    categories: string[];
    series: { name: string; values: number[] }[];
  };
};

export class OnlyOfficeApi {
  static async status(): Promise<OnlyOfficeStatus> {
    const response = await fetch(getApiUrl("/api/v1/ppt/onlyoffice/status"), {
      headers: getHeader(),
      cache: "no-cache",
    });
    return ApiResponseHandler.handleResponse(
      response,
      "Failed to check OnlyOffice MCP status",
    );
  }

  static async readSelection(): Promise<OnlyOfficeReadResponse> {
    const response = await fetch(
      getApiUrl("/api/v1/ppt/onlyoffice/selection"),
      {
        method: "POST",
        headers: getHeader(),
      },
    );
    return ApiResponseHandler.handleResponse(
      response,
      "Failed to read OnlyOffice selection",
    );
  }

  static async readRange(params: {
    range: string;
    sheet?: string;
  }): Promise<OnlyOfficeReadResponse> {
    const response = await fetch(getApiUrl("/api/v1/ppt/onlyoffice/range"), {
      method: "POST",
      headers: getHeader(),
      body: JSON.stringify({
        range: params.range,
        sheet: params.sheet || undefined,
      }),
    });
    return ApiResponseHandler.handleResponse(
      response,
      "Failed to read OnlyOffice range",
    );
  }
}

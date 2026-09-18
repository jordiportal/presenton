import { getApiUrl } from "@/utils/api";
import { getHeader } from "@/app/(presentation-generator)/services/api/header";
import { ApiResponseHandler } from "@/app/(presentation-generator)/services/api/api-error-handler";
import type {
  SimulationSnapshot,
  SimulationSpec,
} from "@/components/slide-editor/types";

export type SimulationRefreshPayload = {
  workbook_id?: string | null;
  pack: string;
  spec: SimulationSpec;
  presentation_id?: string | null;
  element_name?: string | null;
};

export type SimulationOverridePayload = {
  row_key: string;
  column_id: string;
  value: number | null;
};

export class SimulationApi {
  static async refresh(
    payload: SimulationRefreshPayload,
  ): Promise<SimulationSnapshot> {
    const response = await fetch(
      getApiUrl("/api/v1/ppt/simulation/refresh"),
      {
        method: "POST",
        headers: getHeader(),
        body: JSON.stringify(payload),
        cache: "no-cache",
      },
    );
    return ApiResponseHandler.handleResponse(
      response,
      "No se pudo actualizar la simulación",
    );
  }

  static async matrix(workbookId: string): Promise<SimulationSnapshot> {
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/simulation/${encodeURIComponent(workbookId)}/matrix`),
      { headers: getHeader(), cache: "no-cache" },
    );
    return ApiResponseHandler.handleResponse(
      response,
      "No se pudo cargar la matriz de simulación",
    );
  }

  static async setOverride(
    workbookId: string,
    payload: SimulationOverridePayload,
  ): Promise<SimulationSnapshot> {
    const response = await fetch(
      getApiUrl(
        `/api/v1/ppt/simulation/${encodeURIComponent(workbookId)}/override`,
      ),
      {
        method: "POST",
        headers: getHeader(),
        body: JSON.stringify(payload),
        cache: "no-cache",
      },
    );
    return ApiResponseHandler.handleResponse(
      response,
      "No se pudo guardar el override",
    );
  }

  static exportUrl(workbookId: string): string {
    return getApiUrl(
      `/api/v1/ppt/simulation/${encodeURIComponent(workbookId)}/export.xlsx`,
    );
  }
}

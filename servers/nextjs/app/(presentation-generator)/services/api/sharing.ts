import { getApiUrl } from "@/utils/api";
import { getHeader } from "./header";
import { ApiResponseHandler } from "./api-error-handler";

export type ShareRole = "viewer" | "editor";

export type PresentationShare = {
  id: string;
  username: string;
  role: ShareRole;
  created_at: string;
};

export class SharingApi {
  static async list(presentationId: string): Promise<PresentationShare[]> {
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/presentation/${presentationId}/shares`),
      { headers: getHeader(), cache: "no-cache" },
    );
    return ApiResponseHandler.handleResponse(response, "Failed to load sharing");
  }

  static async add(
    presentationId: string,
    username: string,
    role: ShareRole,
  ): Promise<PresentationShare> {
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/presentation/${presentationId}/shares`),
      {
        method: "POST",
        headers: getHeader(),
        body: JSON.stringify({ username, role }),
        cache: "no-cache",
      },
    );
    return ApiResponseHandler.handleResponse(response, "Failed to share presentation");
  }

  static async updateRole(
    presentationId: string,
    shareId: string,
    role: ShareRole,
  ): Promise<PresentationShare> {
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/presentation/${presentationId}/shares/${shareId}`),
      {
        method: "PATCH",
        headers: getHeader(),
        body: JSON.stringify({ role }),
        cache: "no-cache",
      },
    );
    return ApiResponseHandler.handleResponse(response, "Failed to update share");
  }

  static async remove(presentationId: string, shareId: string): Promise<void> {
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/presentation/${presentationId}/shares/${shareId}`),
      { method: "DELETE", headers: getHeader(), cache: "no-cache" },
    );
    await ApiResponseHandler.handleResponse(response, "Failed to remove share");
  }

  static async searchUsers(
    query: string,
  ): Promise<Array<{ id: string; username: string }>> {
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/users/search?q=${encodeURIComponent(query)}`),
      { headers: getHeader(), cache: "no-cache" },
    );
    return ApiResponseHandler.handleResponse(response, "Failed to search users");
  }
}

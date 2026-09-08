import { getHeaderForFormData } from "./header";
import { ApiResponseHandler } from "./api-error-handler";
import { getApiUrl } from "@/utils/api";

export type VideoAssetResponse = {
  path: string;
  file_url: string;
};

export class VideosApi {
  static async uploadVideo(file: File): Promise<VideoAssetResponse> {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(getApiUrl(`/api/v1/ppt/videos/upload`), {
      method: "POST",
      headers: getHeaderForFormData(),
      body: formData,
    });
    return (await ApiResponseHandler.handleResponse(
      response,
      "Failed to upload video",
    )) as VideoAssetResponse;
  }
}

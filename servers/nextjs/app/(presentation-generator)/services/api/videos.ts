import { getHeader, getHeaderForFormData } from "./header";
import { ApiResponseHandler } from "./api-error-handler";
import { getApiUrl } from "@/utils/api";

export type VideoAssetResponse = {
  path?: string;
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

  static async getCapabilities(): Promise<{
    image_to_video: boolean;
    model: string;
  }> {
    const response = await fetch(getApiUrl(`/api/v1/ppt/videos/capabilities`), {
      cache: "no-cache",
    });
    return (await ApiResponseHandler.handleResponse(
      response,
      "Failed to read video capabilities",
    )) as { image_to_video: boolean; model: string };
  }

  static async animateImage(params: {
    imageUrl: string;
    prompt?: string;
    seconds?: string;
  }): Promise<VideoAssetResponse> {
    const response = await fetch(getApiUrl(`/api/v1/ppt/videos/animate`), {
      method: "POST",
      headers: getHeader(),
      body: JSON.stringify({
        image_url: params.imageUrl,
        prompt: params.prompt || undefined,
        seconds: params.seconds || undefined,
      }),
    });
    return (await ApiResponseHandler.handleResponse(
      response,
      "Failed to animate image",
    )) as VideoAssetResponse;
  }
}

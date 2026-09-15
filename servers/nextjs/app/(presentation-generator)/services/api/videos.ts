import { getHeader, getHeaderForFormData } from "./header";
import { ApiResponseHandler } from "./api-error-handler";
import { getApiUrl } from "@/utils/api";

export const VIDEO_ANIMATE_TASK_TYPE = "video.animate";
export const VIDEO_JOB_QUEUED_EVENT = "presenton-video-job-queued";

export type VideoAssetResponse = {
  path?: string;
  file_url: string;
};

export type VideoAnimateTaskData = {
  image_url?: string;
  prompt?: string | null;
  seconds?: string | null;
  presentation_id?: string;
  slide_index?: number;
  element_index?: number;
  element_path?: string;
  poster?: string;
  file_url?: string;
  name?: string;
  decorative?: boolean;
  position?: { x?: number; y?: number };
  size?: { width?: number; height?: number };
  rotation?: number;
  opacity?: number;
};

export type VideoAnimateTask = {
  id: string;
  type: string;
  status: string;
  message?: string | null;
  error?: { status_code?: number; detail?: string } | null;
  data?: VideoAnimateTaskData | null;
  created_at: string;
  updated_at: string;
};

export type EnqueueAnimateImageParams = {
  imageUrl: string;
  prompt?: string;
  seconds?: string;
  presentationId?: string;
  slideIndex?: number;
  elementIndex?: number;
  elementPath?: string;
  poster?: string;
  position?: { x?: number; y?: number } | null;
  size?: { width?: number; height?: number } | null;
  rotation?: number | null;
  opacity?: number | null;
  name?: string | null;
  decorative?: boolean | null;
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

  static async enqueueAnimate(
    params: EnqueueAnimateImageParams,
  ): Promise<VideoAnimateTask> {
    const response = await fetch(getApiUrl(`/api/v1/ppt/videos/animate`), {
      method: "POST",
      headers: getHeader(),
      body: JSON.stringify({
        image_url: params.imageUrl,
        prompt: params.prompt || undefined,
        seconds: params.seconds || undefined,
        presentation_id: params.presentationId || undefined,
        slide_index: params.slideIndex,
        element_index: params.elementIndex,
        element_path: params.elementPath || undefined,
        poster: params.poster || undefined,
        position: params.position || undefined,
        size: params.size || undefined,
        rotation: params.rotation ?? undefined,
        opacity: params.opacity ?? undefined,
        name: params.name || undefined,
        decorative: params.decorative ?? undefined,
      }),
    });
    return (await ApiResponseHandler.handleResponse(
      response,
      "Failed to queue video",
    )) as VideoAnimateTask;
  }

  static async listAnimateTasks(): Promise<VideoAnimateTask[]> {
    const params = new URLSearchParams({
      type: VIDEO_ANIMATE_TASK_TYPE,
      order_by: "created_at",
      order: "desc",
      limit: "20",
      offset: "0",
    });
    const response = await fetch(
      getApiUrl(`/api/v1/async-tasks?${params.toString()}`),
      {
        headers: getHeader(),
        cache: "no-cache",
      },
    );
    return (await ApiResponseHandler.handleResponse(
      response,
      "Failed to list video jobs",
    )) as VideoAnimateTask[];
  }
}

export function emitVideoJobQueued(task: VideoAnimateTask) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(VIDEO_JOB_QUEUED_EVENT, { detail: task }));
}

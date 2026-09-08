import { asRecord, readString } from "@/components/slide-editor/model/model";
import type { VideoElement, VideoProvider } from "@/components/slide-editor/types";

export type ParsedVideoSource = {
  provider: VideoProvider;
  src: string;
  video_id?: string;
  poster?: string;
};

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

export function isVideoElement(value: unknown): value is VideoElement {
  const record = asRecord(value);
  return readString(record?.type) === "video";
}

export function youtubePoster(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}`;
}

export function vimeoEmbedUrl(videoId: string): string {
  return `https://player.vimeo.com/video/${videoId}`;
}

export function parseVideoSource(raw: string): ParsedVideoSource | null {
  const value = raw.trim();
  if (!value) return null;

  if (value.startsWith("/app_data/") || value.startsWith("/static/")) {
    return { provider: "file", src: value };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (YOUTUBE_HOSTS.has(host)) {
    const videoId = youtubeIdFromUrl(parsed);
    if (!videoId) return null;
    return {
      provider: "youtube",
      src: youtubeEmbedUrl(videoId),
      video_id: videoId,
      poster: youtubePoster(videoId),
    };
  }
  if (VIMEO_HOSTS.has(host)) {
    const videoId = vimeoIdFromUrl(parsed);
    if (!videoId) return null;
    return {
      provider: "vimeo",
      src: vimeoEmbedUrl(videoId),
      video_id: videoId,
    };
  }

  return { provider: "url", src: parsed.toString() };
}

function youtubeIdFromUrl(url: URL): string | null {
  if (url.hostname === "youtu.be" || url.hostname === "www.youtu.be") {
    return sanitizeId(url.pathname.split("/").filter(Boolean)[0]);
  }
  const fromQuery = sanitizeId(url.searchParams.get("v"));
  if (fromQuery) return fromQuery;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") {
    return sanitizeId(parts[1]);
  }
  return null;
}

function vimeoIdFromUrl(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  return /^\d+$/.test(last ?? "") ? last : null;
}

function sanitizeId(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^[A-Za-z0-9_-]{6,20}$/.test(value) ? value : null;
}

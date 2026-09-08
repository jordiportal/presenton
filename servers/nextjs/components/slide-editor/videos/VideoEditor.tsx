"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Upload, X } from "lucide-react";
import { VideosApi } from "@/app/(presentation-generator)/services/api/videos";
import { parseVideoSource } from "@/components/slide-editor/videos/video-model";
import type { VideoElement } from "@/components/slide-editor/types";

const ACCEPT = "video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.m4v,.mov,.webm,.ogv";

export function VideoEditorPopover({
  video,
  onChange,
  onClose,
}: {
  video: VideoElement;
  onChange: (video: VideoElement) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(video);
  const [url, setUrl] = useState(video.src ?? "");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const applySource = (raw: string) => {
    const parsed = parseVideoSource(raw);
    if (!parsed) {
      setError("Pega una URL de YouTube, Vimeo o un vídeo https.");
      return;
    }
    setError(null);
    setUrl(raw);
    setDraft((current) => ({
      ...current,
      ...parsed,
      muted: parsed.provider !== "file" ? current.muted : current.muted,
    }));
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-inline-edit-ignore="true"
      className="fixed inset-0 z-[10010] flex items-center justify-center bg-black/35 p-4 font-syne"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="relative w-full max-w-[460px] rounded-2xl bg-white p-5 shadow-[0_24px_80px_rgba(16,24,40,0.24)]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[#191919]">Vídeo</h2>
            <p className="mt-1 text-[11px] text-[#8B8B94]">
              Sube un archivo o pega un enlace de YouTube, Vimeo o MP4.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-[#F7F7FA]"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <label className="mb-3 block text-[12px] font-medium text-[#191919]">
          URL
          <input
            className="mt-1 h-9 w-full rounded-lg border border-[#E6E6EA] px-3 text-[12px]"
            placeholder="https://www.youtube.com/watch?v=…"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setError(null);
            }}
            onBlur={() => {
              if (url.trim()) applySource(url);
            }}
          />
        </label>

        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setUploading(true);
            setError(null);
            try {
              const uploaded = await VideosApi.uploadVideo(file);
              setUrl(uploaded.file_url);
              setDraft((current) => ({
                ...current,
                provider: "file",
                src: uploaded.file_url,
                video_id: null,
                poster: current.poster ?? null,
              }));
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "No se pudo subir el vídeo",
              );
            } finally {
              setUploading(false);
            }
          }}
        />

        <button
          type="button"
          disabled={uploading}
          className="mb-4 inline-flex h-9 items-center gap-2 rounded-lg border border-[#E6E6EA] px-3 text-[12px] font-medium text-[#191919] hover:bg-[#F7F7FA] disabled:opacity-50"
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={14} />
          {uploading ? "Subiendo…" : "Subir archivo"}
        </button>

        <div className="mb-4 flex flex-wrap gap-4 text-[12px] text-[#191919]">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(draft.autoplay)}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  autoplay: event.target.checked,
                  muted: event.target.checked ? true : current.muted,
                }))
              }
            />
            Autoplay
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(draft.loop)}
              onChange={(event) =>
                setDraft((current) => ({ ...current, loop: event.target.checked }))
              }
            />
            Bucle
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(draft.muted) || Boolean(draft.autoplay)}
              disabled={Boolean(draft.autoplay)}
              onChange={(event) =>
                setDraft((current) => ({ ...current, muted: event.target.checked }))
              }
            />
            Silenciado
          </label>
        </div>

        {error ? (
          <p className="mb-3 text-[11px] text-[#B42318]">{error}</p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="h-9 rounded-lg px-3 text-[12px] text-[#667085]"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="h-9 rounded-lg bg-[#7A5AF8] px-4 text-[12px] font-medium text-white"
            onClick={() => {
              const parsed = url.trim() ? parseVideoSource(url) : null;
              onChange({
                ...(parsed ? { ...draft, ...parsed } : draft),
                type: "video",
                autoplay: Boolean(draft.autoplay),
                loop: Boolean(draft.loop),
                muted: Boolean(draft.autoplay) || Boolean(draft.muted),
              });
              onClose();
            }}
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import type Konva from "konva";
import { Play } from "lucide-react";
import { resolveBackendAssetSource } from "@/utils/api";
import {
  isVideoElement,
  vimeoEmbedUrl,
  youtubeEmbedUrl,
} from "@/components/slide-editor/videos/video-model";
import {
  asRecord,
  keyForSelection,
  readArray,
  readString,
  ROOT_ELEMENTS_COMPONENT_INDEX,
  type ElementSelection,
  type RawUi,
} from "@/components/slide-editor/model/model";
import type { VideoElement } from "@/components/slide-editor/types";

type Descriptor = {
  element: VideoElement;
  key: string;
  selection: ElementSelection;
};

export function VideoOverlay({
  isEditMode,
  nodeRefs,
  revision,
  ui,
  onOpenEditor,
}: {
  isEditMode: boolean;
  nodeRefs: RefObject<Map<string, Konva.Node>>;
  revision: number;
  ui: RawUi;
  onOpenEditor: (selection: ElementSelection) => void;
}) {
  const elementRefs = useRef(new Map<string, HTMLDivElement>());
  const descriptors = useMemo(() => collectVideos(ui), [ui]);

  useLayoutEffect(() => {
    const sync = () => {
      descriptors.forEach(({ key }) => {
        const htmlElement = elementRefs.current.get(key);
        const konvaNode = nodeRefs.current?.get(key);
        if (!htmlElement || !konvaNode) {
          if (htmlElement) htmlElement.style.display = "none";
          return;
        }
        const matrix = konvaNode.getAbsoluteTransform().getMatrix();
        htmlElement.style.display = konvaNode.isVisible() ? "flex" : "none";
        htmlElement.style.width = `${konvaNode.width()}px`;
        htmlElement.style.height = `${konvaNode.height()}px`;
        htmlElement.style.transform = `matrix(${matrix.join(",")})`;
      });
    };

    sync();
    const stage = Array.from(nodeRefs.current?.values() ?? [])
      .map((node) => node.getStage())
      .find(Boolean);
    if (!stage) return;
    const layers = stage.getLayers();
    stage.on("dragmove.videoOverlay transform.videoOverlay", sync);
    layers.forEach((layer) => layer.on("draw.videoOverlay", sync));
    return () => {
      stage.off("dragmove.videoOverlay transform.videoOverlay", sync);
      layers.forEach((layer) => layer.off("draw.videoOverlay", sync));
    };
  }, [descriptors, nodeRefs, revision]);

  return (
    <div
      data-template-v2-video-layer="true"
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 5 }}
    >
      {descriptors.map(({ element, key, selection }) => (
        <div
          key={key}
          ref={(node) => {
            if (node) elementRefs.current.set(key, node);
            else elementRefs.current.delete(key);
          }}
          className="absolute left-0 top-0 flex flex-col origin-top-left overflow-hidden"
          style={{ pointerEvents: "none" }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            if (isEditMode) onOpenEditor(selection);
          }}
        >
          {isEditMode ? (
            <div
              className="flex h-[22px] shrink-0 items-center px-1 text-[10px] font-semibold uppercase tracking-wide text-white"
              style={{ pointerEvents: "auto", background: "rgba(17,24,39,0.72)" }}
            >
              Vídeo
            </div>
          ) : null}
          <div className="min-h-0 min-w-0 flex-1" style={{ pointerEvents: "auto" }}>
            <VideoFrame element={element} interactive />
          </div>
        </div>
      ))}
    </div>
  );
}

export function VideoFrame({
  element,
  interactive,
}: {
  element: VideoElement;
  interactive: boolean;
}) {
  const provider = element.provider ?? "file";
  const src = element.src?.trim() ?? "";
  const poster = element.poster
    ? resolveBackendAssetSource(element.poster)
    : undefined;
  const fileSrc = src ? resolveBackendAssetSource(src) : "";

  if (!src) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-[#D0D5DD] bg-[#111827] text-white">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-white/15">
          <Play className="h-5 w-5 fill-white" />
        </span>
        <span className="text-[12px] font-medium">
          {interactive ? "Doble clic para añadir un vídeo" : "Vídeo"}
        </span>
      </div>
    );
  }

  if (provider === "youtube" && element.video_id) {
    return interactive ? (
      <iframe
        title="YouTube"
        src={`${youtubeEmbedUrl(element.video_id)}?rel=0`}
        className="h-full w-full rounded-[12px] border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    ) : (
      <VideoPoster poster={poster} />
    );
  }

  if (provider === "vimeo" && element.video_id) {
    return interactive ? (
      <iframe
        title="Vimeo"
        src={vimeoEmbedUrl(element.video_id)}
        className="h-full w-full rounded-[12px] border-0"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    ) : (
      <VideoPoster poster={poster} />
    );
  }

  return (
    <video
      className="h-full w-full rounded-[12px] bg-black object-cover"
      src={fileSrc}
      poster={poster}
      controls={interactive}
      autoPlay={Boolean(element.autoplay)}
      loop={Boolean(element.loop)}
      muted={Boolean(element.muted) || Boolean(element.autoplay)}
      playsInline
    />
  );
}

function VideoPoster({ poster }: { poster?: string }) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-[12px] bg-[#111827]">
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          src={poster}
          className="h-full w-full object-cover"
        />
      ) : null}
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-black/55">
          <Play className="h-5 w-5 fill-white text-white" />
        </span>
      </span>
    </div>
  );
}

function collectVideos(ui: RawUi): Descriptor[] {
  const found: Descriptor[] = [];
  const visit = (
    elements: unknown[],
    componentIndex: number,
    parentPath: number[],
  ) => {
    elements.forEach((item, index) => {
      const record = asRecord(item);
      if (!record) return;
      const elementPath = [...parentPath, index];
      const selection: ElementSelection = {
        kind: "element",
        componentIndex,
        elementPath,
      };
      if (isVideoElement(record)) {
        found.push({
          element: record,
          key: keyForSelection(selection),
          selection,
        });
        return;
      }
      const children = readArray(record.children);
      if (children.length) visit(children, componentIndex, elementPath);
      if (readString(record.type) === "container" && record.child) {
        visit([record.child], componentIndex, elementPath);
      }
    });
  };

  visit(readArray(ui.elements), ROOT_ELEMENTS_COMPONENT_INDEX, []);
  readArray(ui.components).forEach((component, componentIndex) => {
    const record = asRecord(component);
    if (!record) return;
    visit(readArray(record.elements), componentIndex, []);
  });
  return found;
}

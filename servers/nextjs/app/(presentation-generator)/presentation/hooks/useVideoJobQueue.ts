"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { notify } from "@/components/ui/sonner";
import {
  getElementAtSelection,
  selectionFromKey,
  updateElementInUi,
  type RawUi,
} from "@/components/slide-editor/model/model";
import type { VideoElement } from "@/components/slide-editor/types";
import {
  VIDEO_JOB_QUEUED_EVENT,
  VideosApi,
  type VideoAnimateTask,
  type VideoAnimateTaskData,
} from "@/app/(presentation-generator)/services/api/videos";
import { updateSlideUi } from "@/store/slices/presentationGeneration";
import type { RootState } from "@/store/store";

const POLL_ACTIVE_MS = 2000;
const POLL_IDLE_MS = 12000;

function taskData(task: VideoAnimateTask): VideoAnimateTaskData {
  return task.data && typeof task.data === "object" ? task.data : {};
}

function taskBelongsToPresentation(
  task: VideoAnimateTask,
  presentationId: string,
) {
  return taskData(task).presentation_id === presentationId;
}

function taskErrorMessage(task: VideoAnimateTask) {
  const detail = task.error?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  return task.message || "Video generation failed";
}

function asPosition(value: unknown): VideoElement["position"] {
  if (!value || typeof value !== "object") return undefined;
  const record = value as { x?: unknown; y?: unknown };
  if (typeof record.x === "number" && typeof record.y === "number") {
    return { x: record.x, y: record.y };
  }
  return undefined;
}

function asSize(value: unknown): VideoElement["size"] {
  if (!value || typeof value !== "object") return undefined;
  const record = value as { width?: unknown; height?: unknown };
  if (typeof record.width === "number" && typeof record.height === "number") {
    return { width: record.width, height: record.height };
  }
  return undefined;
}

export function videoElementFromTask(
  task: VideoAnimateTask,
  current?: Record<string, unknown>,
): VideoElement {
  const data = taskData(task);
  return {
    type: "video",
    position: asPosition(current?.position) ?? asPosition(data.position),
    size: asSize(current?.size) ?? asSize(data.size),
    rotation:
      typeof current?.rotation === "number" ? current.rotation : data.rotation,
    opacity:
      typeof current?.opacity === "number" ? current.opacity : data.opacity,
    src: data.file_url,
    provider: "file",
    video_id: null,
    poster: data.poster ?? null,
    autoplay: true,
    loop: true,
    muted: true,
    decorative:
      typeof current?.decorative === "boolean"
        ? current.decorative
        : (data.decorative ?? false),
    name:
      (typeof current?.name === "string" && current.name) ||
      data.name ||
      "video",
  };
}

export function applyVideoTaskToUi(
  ui: RawUi,
  task: VideoAnimateTask,
): RawUi | null {
  const data = taskData(task);
  if (!data.element_path || !data.file_url) return null;
  const selection = selectionFromKey(data.element_path);
  if (selection?.kind !== "element") return null;
  const current = getElementAtSelection(ui, selection);
  if (!current) return null;
  const type = current.type;
  if (type !== "image" && type !== "video") return null;
  if (type === "video" && current.src === data.file_url) return null;
  return updateElementInUi(ui, selection, (element) =>
    videoElementFromTask(task, element),
  );
}

export function useVideoJobQueue(presentationId: string | undefined) {
  const dispatch = useDispatch();
  const slides = useSelector(
    (state: RootState) => state.presentationGeneration.presentationData?.slides,
  );
  const [tasks, setTasks] = useState<VideoAnimateTask[]>([]);
  const seenStatusRef = useRef<Map<string, string>>(new Map());
  const appliedRef = useRef<Set<string>>(new Set());
  const slidesRef = useRef(slides);
  slidesRef.current = slides;

  const applyCompletedTask = useCallback(
    (task: VideoAnimateTask, { toast }: { toast: boolean }) => {
      if (appliedRef.current.has(task.id)) return;
      const data = taskData(task);
      const slideIndex = data.slide_index;
      const fileUrl = data.file_url;
      if (typeof slideIndex !== "number" || !fileUrl) {
        appliedRef.current.add(task.id);
        return;
      }
      const slide = slidesRef.current?.[slideIndex];
      const ui = slide?.ui as RawUi | undefined;
      if (!ui) {
        appliedRef.current.add(task.id);
        return;
      }
      const nextUi = applyVideoTaskToUi(ui, task);
      appliedRef.current.add(task.id);
      if (nextUi) {
        dispatch(updateSlideUi({ index: slideIndex, ui: nextUi }));
      }
      if (toast) {
        notify.success(
          "Vídeo listo",
          `Se ha colocado en la diapositiva ${slideIndex + 1}.`,
        );
      }
    },
    [dispatch],
  );

  const mergeTasks = useCallback((incoming: VideoAnimateTask[]) => {
    setTasks((current) => {
      const byId = new Map(current.map((task) => [task.id, task]));
      for (const task of incoming) {
        byId.set(task.id, task);
      }
      return Array.from(byId.values()).sort(
        (left, right) =>
          Date.parse(right.created_at || "") - Date.parse(left.created_at || ""),
      );
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!presentationId) return;
    try {
      const listed = await VideosApi.listAnimateTasks();
      if (!presentationId) return;
      const scoped = listed.filter((task) =>
        taskBelongsToPresentation(task, presentationId),
      );
      mergeTasks(scoped);

      for (const task of scoped) {
        const previous = seenStatusRef.current.get(task.id);
        seenStatusRef.current.set(task.id, task.status);
        if (task.status === "completed") {
          const isNewCompletion = previous !== "completed";
          applyCompletedTask(task, {
            toast: Boolean(previous) && isNewCompletion,
          });
        } else if (
          task.status === "error" &&
          previous &&
          previous !== "error"
        ) {
          notify.error("Vídeo fallido", taskErrorMessage(task));
        }
      }
    } catch (error) {
      console.warn("Failed to poll video jobs", error);
    }
  }, [applyCompletedTask, mergeTasks, presentationId]);

  const pendingCount = useMemo(
    () => tasks.filter((task) => task.status === "pending").length,
    [tasks],
  );

  useEffect(() => {
    seenStatusRef.current.clear();
    appliedRef.current.clear();
    setTasks([]);
  }, [presentationId]);

  useEffect(() => {
    if (!presentationId) return;
    void refresh();
  }, [presentationId, refresh]);

  useEffect(() => {
    if (!presentationId) return;
    const timer = window.setInterval(
      () => {
        void refresh();
      },
      pendingCount > 0 ? POLL_ACTIVE_MS : POLL_IDLE_MS,
    );
    return () => window.clearInterval(timer);
  }, [pendingCount, presentationId, refresh]);

  useEffect(() => {
    const onQueued = (event: Event) => {
      const task = (event as CustomEvent<VideoAnimateTask>).detail;
      if (!task?.id) return;
      if (
        presentationId &&
        !taskBelongsToPresentation(task, presentationId)
      ) {
        return;
      }
      seenStatusRef.current.set(task.id, task.status || "pending");
      mergeTasks([task]);
    };
    window.addEventListener(VIDEO_JOB_QUEUED_EVENT, onQueued);
    return () => window.removeEventListener(VIDEO_JOB_QUEUED_EVENT, onQueued);
  }, [mergeTasks, presentationId]);

  return { tasks, pendingCount, refresh };
}

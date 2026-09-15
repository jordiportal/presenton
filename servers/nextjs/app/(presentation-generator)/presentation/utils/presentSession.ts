export const AUDIENCE_MODE = "present";
export const PRESENTER_MODE = "presenter";

export type PresentSessionMode = typeof AUDIENCE_MODE | typeof PRESENTER_MODE;

export const PRESENTER_WINDOW_FEATURES =
  "popup=yes,width=1440,height=900,menubar=no,toolbar=no,resizable=yes";

export type PresentSessionMessage =
  | { type: "slide"; index: number }
  | { type: "slide-ui"; index: number; ui: Record<string, unknown> }
  | { type: "exit" };

export const PRESENT_SLIDE_UI_EVENT = "presenton-present-slide-ui";

export function isPresentSessionMode(
  mode: string | null | undefined,
): mode is PresentSessionMode {
  return mode === AUDIENCE_MODE || mode === PRESENTER_MODE;
}

export function presentChannelName(presentationId: string): string {
  return `presenton-present:${presentationId}`;
}

export function presenterWindowName(presentationId: string): string {
  return `presenton-presenter-${presentationId}`;
}

export function parsePresentSessionMessage(
  data: unknown,
): PresentSessionMessage | null {
  if (!data || typeof data !== "object") return null;
  const type = (data as { type?: unknown }).type;
  if (type === "exit") return { type: "exit" };
  const index = (data as { index?: unknown }).index;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
    return null;
  }
  if (type === "slide") {
    return { type: "slide", index };
  }
  if (type === "slide-ui") {
    const ui = (data as { ui?: unknown }).ui;
    if (!ui || typeof ui !== "object" || Array.isArray(ui)) return null;
    return { type: "slide-ui", index, ui: ui as Record<string, unknown> };
  }
  return null;
}

export function buildPresentationPath(options: {
  presentationId: string;
  mode?: PresentSessionMode | null;
  slide?: number;
  search?: string | URLSearchParams | null;
}): string {
  const params = new URLSearchParams(
    typeof options.search === "string"
      ? options.search
      : options.search?.toString() ?? "",
  );
  params.set("id", options.presentationId);
  if (options.mode) {
    params.set("mode", options.mode);
    if (typeof options.slide === "number" && Number.isFinite(options.slide)) {
      params.set("slide", String(Math.max(0, Math.floor(options.slide))));
    }
  } else {
    params.delete("mode");
    params.delete("slide");
  }
  if (options.mode === PRESENTER_MODE) {
    params.delete("embed");
  }
  return `/presentation?${params.toString()}`;
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function openPresenterWindow(
  presentationId: string,
  url: string,
): Window | null {
  if (typeof window === "undefined") return null;
  return window.open(
    url,
    presenterWindowName(presentationId),
    PRESENTER_WINDOW_FEATURES,
  );
}

export function emitPresentSlideUi(
  index: number,
  ui: Record<string, unknown>,
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PRESENT_SLIDE_UI_EVENT, { detail: { index, ui } }),
  );
}

/**
 * App-wide "slide clipboard" so a slide can be copied in one presentation and
 * pasted into another. We persist to localStorage (shared across tabs of the
 * same browser/origin) so the copy survives navigating to a different
 * presentation. Only the presentation-portable fields are stored; the target
 * gets a brand new `id`, `presentation` and `index` on paste.
 */

const CLIPBOARD_KEY = "presenton:slide-clipboard:v1";

export interface SlideClipboardPayload {
  __presentonSlideClipboard: true;
  version: 1;
  copiedAt: number;
  sourcePresentationId?: string | null;
  label?: string | null;
  slide: {
    content?: unknown;
    ui?: Record<string, unknown> | null;
    html_content?: string | null;
    layout?: string;
    layout_group?: string;
    properties?: unknown;
    speaker_note?: string;
    images?: string[] | null;
    icons?: string[] | null;
    type?: number;
    design_index?: number | null;
    graph_id?: string | null;
  };
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null));
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/** Derive a short human label for notifications (best effort). */
function deriveLabel(slide: any): string | null {
  const title =
    slide?.content?.title ||
    slide?.content?.__title__ ||
    slide?.content?.heading;
  if (typeof title === "string" && title.trim()) {
    return title.trim().slice(0, 60);
  }
  return null;
}

/**
 * Serialize the portable subset of a presentation slide into the clipboard.
 * Returns true when the write succeeded.
 */
export function copySlideToClipboard(
  slide: any,
  sourcePresentationId?: string | null,
): boolean {
  if (!isBrowser() || !slide) return false;
  try {
    const payload: SlideClipboardPayload = {
      __presentonSlideClipboard: true,
      version: 1,
      copiedAt: Date.now(),
      sourcePresentationId: sourcePresentationId ?? slide.presentation ?? null,
      label: deriveLabel(slide),
      slide: {
        content: deepClone(slide.content ?? {}),
        ui: slide.ui ? deepClone(slide.ui) : null,
        html_content:
          typeof slide.html_content === "string" ? slide.html_content : null,
        layout: typeof slide.layout === "string" ? slide.layout : undefined,
        layout_group:
          typeof slide.layout_group === "string"
            ? slide.layout_group
            : undefined,
        properties: slide.properties ? deepClone(slide.properties) : null,
        speaker_note:
          typeof slide.speaker_note === "string" ? slide.speaker_note : "",
        images: Array.isArray(slide.images) ? deepClone(slide.images) : null,
        icons: Array.isArray(slide.icons) ? deepClone(slide.icons) : null,
        type: typeof slide.type === "number" ? slide.type : undefined,
        design_index:
          typeof slide.design_index === "number" ? slide.design_index : null,
        graph_id:
          typeof slide.graph_id === "string" ? slide.graph_id : null,
      },
    };
    localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

/** Read and validate the current slide clipboard payload (or null). */
export function readSlideClipboard(): SlideClipboardPayload | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(CLIPBOARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      parsed.__presentonSlideClipboard === true &&
      parsed.slide &&
      typeof parsed.slide === "object"
    ) {
      return parsed as SlideClipboardPayload;
    }
    return null;
  } catch {
    return null;
  }
}

/** Cheap check for enabling a "Paste" action. */
export function hasSlideClipboard(): boolean {
  return readSlideClipboard() !== null;
}

/**
 * Build the slide object to insert into the target presentation. Assigns the
 * provided new id and target presentation id; index is reconciled by the store.
 */
export function buildPastedSlideData(
  payload: SlideClipboardPayload,
  options: { id: string; presentationId: string; index: number },
): Record<string, unknown> {
  const slide = payload.slide ?? {};
  return {
    id: options.id,
    presentation: options.presentationId,
    index: options.index,
    content: deepClone(slide.content ?? {}),
    ui: slide.ui ? deepClone(slide.ui) : null,
    html_content: slide.html_content ?? null,
    layout: slide.layout,
    layout_group: slide.layout_group,
    properties: slide.properties ? deepClone(slide.properties) : null,
    speaker_note: slide.speaker_note ?? "",
    images: Array.isArray(slide.images) ? deepClone(slide.images) : null,
    icons: Array.isArray(slide.icons) ? deepClone(slide.icons) : null,
    type: typeof slide.type === "number" ? slide.type : 0,
    design_index:
      typeof slide.design_index === "number" ? slide.design_index : null,
    graph_id: slide.graph_id ?? null,
  };
}

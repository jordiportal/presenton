import type { TemplateV2Layout } from "@/components/slide-editor/importing/template-v2-import";

export const PRESENTON_BLANK_SLIDE_PROMPT_EVENT =
  "presenton:blank-slide-prompt";

export const PRESENTON_ACTIVATE_AI_PANEL_EVENT =
  "presenton:activate-ai-panel";

export type BlankSlidePromptEventDetail = {
  prompt: string;
  slideIndex?: number | null;
  layoutId?: string | null;
  promptKind?: "blank" | "layout";
  layout?: TemplateV2Layout | null;
};

let queuedBlankSlidePrompt: BlankSlidePromptEventDetail | null = null;

export function queueBlankSlidePrompt(detail: BlankSlidePromptEventDetail) {
  queuedBlankSlidePrompt = detail;
}

export function peekQueuedBlankSlidePrompt() {
  return queuedBlankSlidePrompt;
}

export function consumeQueuedBlankSlidePrompt() {
  const detail = queuedBlankSlidePrompt;
  queuedBlankSlidePrompt = null;
  return detail;
}

export function dispatchBlankSlidePrompt(detail: BlankSlidePromptEventDetail) {
  if (typeof window === "undefined") return;

  queueBlankSlidePrompt(detail);
  window.dispatchEvent(new CustomEvent(PRESENTON_ACTIVATE_AI_PANEL_EVENT));
  window.dispatchEvent(
    new CustomEvent<BlankSlidePromptEventDetail>(
      PRESENTON_BLANK_SLIDE_PROMPT_EVENT,
      { detail },
    ),
  );
}

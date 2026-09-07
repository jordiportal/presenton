import React, { memo } from "react";
import Image from "next/image";
import { Loader2, Lock } from "lucide-react";
import SlideScale from "../../components/PresentationRender";
import SlideActionBar from "./SlideActionBar";
import { isTemplateV2Slide } from "../../_shared/blank-slide";
import { cn } from "@/lib/utils";
import { collaborationHolderLabel } from "../../services/api/collaboration";

interface SlideContentProps {
  slide: any;
  index: number;
  selected?: boolean;
  presentationId: string;
  onSlideAdded?: (
    index: number,
    options?: {
      promptOverlaySlideId?: string;
      promptOverlayKind?: "blank" | "layout";
    },
  ) => void;
  onSlideActive?: (index: number) => void;
  isChatEditing?: boolean;
  showBlankPromptOverlay?: boolean;
  onBlankPromptOverlayDismiss?: () => void;
  showTemplatePromptOverlay?: boolean;
  onTemplatePromptOverlayDismiss?: () => void;
  theme?: unknown;
  fonts?: unknown;
  editingDisabled?: boolean;
  isStreaming?: boolean | null;
  fitToContainer?: boolean;
  lockedBy?: { holder_name?: string | null } | null;
}

const SlideContent = ({
  slide,
  index,
  selected = false,
  presentationId,
  onSlideAdded,
  onSlideActive,
  isChatEditing = false,
  showBlankPromptOverlay = false,
  onBlankPromptOverlayDismiss,
  showTemplatePromptOverlay = false,
  onTemplatePromptOverlayDismiss,
  theme,
  fonts,
  editingDisabled = false,
  isStreaming = false,
  fitToContainer = false,
  lockedBy = null,
}: SlideContentProps) => {
  const canEditSlide = !editingDisabled && isStreaming !== true && !lockedBy;
  const lockLabel = lockedBy
    ? `Being edited by ${collaborationHolderLabel(lockedBy)}`
    : null;

  const isTemplateV2SlideContent = isTemplateV2Slide(slide);

  return (
    <div
      id={`slide-${index}`}
      className={cn(
        "main-slide relative flex w-full items-center justify-center",
        fitToContainer ? "h-full min-h-0" : "max-md:mb-4",
      )}
    >
      {isStreaming && (
        <Loader2 className="absolute right-2 top-2 z-30 h-8 w-8 animate-spin text-blue-800" />
      )}
      <div
        data-layout={slide?.layout}
        data-group={slide?.layout_group}
        className={cn(
          "group w-full font-syne",
          isTemplateV2SlideContent && "relative",
          fitToContainer && "flex h-full min-h-0 flex-col",
        )}
      >
        <div
          className={cn(
            "relative",
            isChatEditing && "chat-slide-glow rounded-[14px]",
            fitToContainer
              ? "flex min-h-0 flex-1 items-center justify-center"
              : "max-xl:mb-6",
          )}
          onPointerDownCapture={() => onSlideActive?.(index)}
        >
          {lockLabel ? (
            <div
              className="absolute inset-0 z-[85] flex items-start justify-center rounded-[14px] bg-white/45 pt-6 font-syne"
              data-collaboration-locked="true"
              aria-live="polite"
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-[#E1E3E9] bg-white/95 px-3 py-1.5 text-[13px] text-[#344054] shadow-[0_8px_24px_rgba(16,24,40,0.12)]">
                <Lock className="h-3.5 w-3.5 text-[#7A5AF8]" aria-hidden="true" />
                {lockLabel}
              </span>
            </div>
          ) : null}
          {isChatEditing && (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-4 z-[90] flex justify-center font-syne"
              aria-live="polite"
            >
              <span className="inline-flex items-center rounded-[50px] bg-[linear-gradient(179deg,#F2E1FB_0%,#FFFFFF_100%)] p-[10px] shadow-[0_4px_18px_rgba(40,35,68,0.12)]">
                <span className="flex items-center justify-center gap-[3px] px-1">
                  <Image
                    src="/ai-star.svg"
                    alt=""
                    width={13}
                    height={14}
                    className="h-[14px] w-[13px] shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-[13px] font-normal leading-[14px] tracking-[0.39px] text-[#666666]">
                    Updating slides...
                  </span>
                </span>
              </span>
            </div>
          )}
          <SlideScale
            slide={slide}
            presentationId={presentationId}
            isEditMode={canEditSlide}
            isClickable={canEditSlide}
            theme={theme ?? null}
            fonts={fonts}
            renderIndex={index}
            isSelected={selected}
            fitToContainer={fitToContainer}
            showEditScan={isChatEditing}
            showBlankPromptOverlay={showBlankPromptOverlay}
            onBlankPromptOverlayDismiss={onBlankPromptOverlayDismiss}
            showTemplatePromptOverlay={showTemplatePromptOverlay}
            onTemplatePromptOverlayDismiss={onTemplatePromptOverlayDismiss}
          />
        </div>
        <div
          className={cn(
            "w-full shrink-0",
            fitToContainer ? "mt-5" : "my-3 xl:my-4",
          )}
        >
          <SlideActionBar
            slide={slide}
            selectedSlide={index}
            presentationId={presentationId}
            onSlideSelected={onSlideAdded ?? (() => undefined)}
          />
        </div>
      </div>
    </div>
  );
};

export default memo(
  SlideContent,
  (previous, next) =>
    previous.slide === next.slide &&
    previous.index === next.index &&
    previous.selected === next.selected &&
    previous.presentationId === next.presentationId &&
    previous.onSlideAdded === next.onSlideAdded &&
    previous.onSlideActive === next.onSlideActive &&
    previous.isChatEditing === next.isChatEditing &&
    previous.showBlankPromptOverlay === next.showBlankPromptOverlay &&
    previous.showTemplatePromptOverlay === next.showTemplatePromptOverlay &&
    previous.theme === next.theme &&
    previous.fonts === next.fonts &&
    previous.editingDisabled === next.editingDisabled &&
    previous.isStreaming === next.isStreaming &&
    previous.fitToContainer === next.fitToContainer &&
    previous.lockedBy === next.lockedBy,
);

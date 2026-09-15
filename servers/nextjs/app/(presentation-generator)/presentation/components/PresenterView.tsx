"use client";

import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  ScreenShareOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Slide } from "../../types/slide";
import SlideScale from "../../components/PresentationRender";
import type { Theme } from "../../services/api/types";
import type { TemplateTheme } from "@/lib/template-theme";
import { applyPresentationThemeToElement } from "../utils/applyPresentationThemeDom";
import { formatElapsed } from "../utils/presentSession";

interface PresenterViewProps {
  slides: Slide[];
  currentSlide: number;
  theme?: Theme | TemplateTheme | null;
  fonts?: unknown;
  title?: string | null;
  onExit: () => void;
  onSlideChange: (slideNumber: number) => void;
}

function PresenterSlide({
  slide,
  slideIndex,
  theme,
  fonts,
  presentMode = false,
  interactive = false,
}: {
  slide: Slide;
  slideIndex: number;
  theme?: Theme | TemplateTheme | null;
  fonts?: unknown;
  presentMode?: boolean;
  interactive?: boolean;
}) {
  return (
    <SlideScale
      slide={slide}
      theme={theme ?? undefined}
      fonts={fonts}
      isEditMode={false}
      presentMode={presentMode}
      fitToContainer={!presentMode}
      isClickable={interactive}
      renderIndex={slideIndex}
    />
  );
}

const MemoPresenterSlide = memo(
  PresenterSlide,
  (previous, next) =>
    previous.slide === next.slide &&
    previous.slideIndex === next.slideIndex &&
    previous.theme === next.theme &&
    previous.fonts === next.fonts &&
    previous.presentMode === next.presentMode &&
    previous.interactive === next.interactive,
);

function IconButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-9 items-center justify-center rounded-[8px] text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}

const PresenterView: React.FC<PresenterViewProps> = ({
  slides,
  currentSlide,
  theme,
  fonts,
  title,
  onExit,
  onSlideChange,
}) => {
  const [now, setNow] = useState(() => Date.now());
  const [runningSince, setRunningSince] = useState(() => Date.now());
  const [accumulatedMs, setAccumulatedMs] = useState(0);
  const [paused, setPaused] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const slideCount = Array.isArray(slides) ? slides.length : 0;
  const activeSlideIndex = useMemo(() => {
    if (slideCount <= 0) return 0;
    const parsedSlide = Number.isFinite(currentSlide) ? currentSlide : 0;
    return Math.min(Math.max(parsedSlide, 0), slideCount - 1);
  }, [currentSlide, slideCount]);

  const activeSlide = slideCount > 0 ? slides[activeSlideIndex] : null;
  const nextSlide =
    slideCount > 0 && activeSlideIndex < slideCount - 1
      ? slides[activeSlideIndex + 1]
      : null;
  const speakerNote = activeSlide?.speaker_note?.trim() || "";

  useEffect(() => {
    const previous = document.title;
    const deckTitle = (title || "").trim() || "Presentation";
    document.title = `Presenter · ${deckTitle}`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useLayoutEffect(() => {
    if (!theme || !rootRef.current) return;
    applyPresentationThemeToElement(rootRef.current, theme);
  }, [theme]);

  const elapsedMs = paused ? accumulatedMs : accumulatedMs + (now - runningSince);
  const clockLabel = new Date(now).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  const goNext = useCallback(() => {
    if (activeSlideIndex < slideCount - 1) onSlideChange(activeSlideIndex + 1);
  }, [activeSlideIndex, slideCount, onSlideChange]);

  const goPrev = useCallback(() => {
    if (activeSlideIndex > 0) onSlideChange(activeSlideIndex - 1);
  }, [activeSlideIndex, onSlideChange]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const navKeys = [
        "ArrowRight",
        "ArrowLeft",
        "ArrowUp",
        "ArrowDown",
        " ",
        "Home",
        "End",
        "PageDown",
        "PageUp",
      ];
      if (navKeys.includes(event.key)) event.preventDefault();
      if (event.repeat && [" ", "ArrowRight", "ArrowLeft"].includes(event.key)) {
        return;
      }

      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
        case " ":
        case "PageDown":
          goNext();
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          goPrev();
          break;
        case "Home":
          if (activeSlideIndex !== 0) onSlideChange(0);
          break;
        case "End":
          if (slideCount > 0 && activeSlideIndex !== slideCount - 1) {
            onSlideChange(slideCount - 1);
          }
          break;
        case "Escape":
          onExit();
          break;
        default:
          break;
      }
    },
    [activeSlideIndex, goNext, goPrev, onExit, onSlideChange, slideCount],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const togglePause = () => {
    if (paused) {
      setRunningSince(Date.now());
      setPaused(false);
      return;
    }
    setAccumulatedMs(accumulatedMs + (Date.now() - runningSince));
    setPaused(true);
  };

  const resetTimer = () => {
    const stamped = Date.now();
    setAccumulatedMs(0);
    setRunningSince(stamped);
    setNow(stamped);
    setPaused(false);
  };

  if (slideCount === 0 || !activeSlide) {
    return (
      <div className="flex h-[100dvh] w-[100dvw] items-center justify-center bg-[#111218] font-syne text-[#E6E6E6]">
        Loading presenter view…
      </div>
    );
  }

  return (
    <div
      id="presenter-view-wrapper"
      ref={rootRef}
      role="application"
      aria-label="Presenter view"
      className="flex h-[100dvh] w-[100dvw] flex-col overflow-hidden bg-[#111218] font-syne text-white"
    >
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/10 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <span className="text-[13px] font-medium tabular-nums text-[#C4C4C4]">
            {clockLabel}
          </span>
          <div className="flex items-center gap-1">
            <span className="min-w-[52px] text-center text-[15px] font-semibold tabular-nums tracking-[-0.2px]">
              {formatElapsed(elapsedMs)}
            </span>
            <IconButton
              title={paused ? "Resume timer" : "Pause timer"}
              onClick={togglePause}
            >
              {paused ? (
                <Play className="size-4" strokeWidth={2} />
              ) : (
                <Pause className="size-4" strokeWidth={2} />
              )}
            </IconButton>
            <IconButton title="Reset timer" onClick={resetTimer}>
              <RotateCcw className="size-3.5" strokeWidth={2} />
            </IconButton>
          </div>
        </div>
        <div className="hidden truncate text-[13px] text-[#A1A1AA] sm:block">
          {(title || "").trim() || "Presentation"}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[13px] tabular-nums text-[#C4C4C4]">
            {activeSlideIndex + 1} / {slideCount}
          </span>
          <button
            type="button"
            onClick={onExit}
            className="inline-flex items-center gap-2 rounded-[8px] border border-white/15 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-white/10"
          >
            <ScreenShareOff className="size-3.5" strokeWidth={2} />
            End
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.9fr)] lg:gap-5 lg:p-5">
        <section className="flex min-h-0 flex-col gap-3">
          <div className="min-h-0 flex-1 overflow-hidden rounded-[12px] bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
            <MemoPresenterSlide
              slide={activeSlide}
              slideIndex={activeSlideIndex}
              theme={theme}
              fonts={fonts}
              presentMode
              interactive
            />
          </div>
          <div className="flex shrink-0 items-center justify-between">
            <div className="flex items-center gap-2">
              <IconButton
                title="Previous slide"
                disabled={activeSlideIndex === 0}
                onClick={goPrev}
              >
                <ChevronLeft className="size-5" strokeWidth={2} />
              </IconButton>
              <IconButton
                title="Next slide"
                disabled={activeSlideIndex >= slideCount - 1}
                onClick={goNext}
              >
                <ChevronRight className="size-5" strokeWidth={2} />
              </IconButton>
            </div>
            <p className="text-[12px] text-[#8B8B93]">
              Keys also control the audience window
            </p>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col gap-4">
          <div className="shrink-0">
            <h2 className="mb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-[#8B8B93]">
              Next
            </h2>
            {nextSlide ? (
              <button
                type="button"
                onClick={goNext}
                className="block w-full overflow-hidden rounded-[10px] bg-black text-left shadow-[0_0_0_1px_rgba(255,255,255,0.08)] transition-shadow hover:shadow-[0_0_0_2px_#7A5AF8]"
              >
                <div className="aspect-video w-full">
                  <MemoPresenterSlide
                    slide={nextSlide}
                    slideIndex={activeSlideIndex + 1}
                    theme={theme}
                    fonts={fonts}
                  />
                </div>
              </button>
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-[10px] border border-dashed border-white/15 text-[13px] text-[#8B8B93]">
                Last slide
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[12px] bg-[#1A1B20] p-4">
            <h2 className="mb-3 text-[12px] font-medium uppercase tracking-[0.08em] text-[#8B8B93]">
              Speaker notes
            </h2>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {speakerNote ? (
                <p className="whitespace-pre-wrap font-manrope text-[16px] font-medium leading-7 text-[#EDEDED]">
                  {speakerNote}
                </p>
              ) : (
                <p className="text-[14px] leading-6 text-[#8B8B93]">
                  No speaker notes for this slide. Add them in the editor.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default PresenterView;

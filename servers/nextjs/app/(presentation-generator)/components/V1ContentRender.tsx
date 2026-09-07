"use client";

import React, { useMemo } from "react";
import SlideErrorBoundary from "../components/SlideErrorBoundary";

import {
    type TemplateV2Layout,
} from "@/components/slide-editor/importing/template-v2-import";
import { TemplateV2KonvaSlide } from "@/components/slide-editor/surface/TemplateV2KonvaSlide";
import {
    BLANK_TEMPLATE_V2_LAYOUT,
    isBlankPresentationSlide,
    isTemplateV2Slide as isTemplateV2PresentationSlide,
} from "../_shared/blank-slide";
import { TemplateV2PromptOverlay } from "../_shared/TemplateV2PromptOverlay";


export const V1ContentRender = ({
    slide,
    presentationId,
    isEditMode,
    fonts,
    renderIndex,
    displayScale = 1,
    enableViewportCulling = false,
    isSelected = false,
    showBlankPromptOverlay = false,
    onBlankPromptOverlayDismiss,
    showTemplatePromptOverlay = false,
    onTemplatePromptOverlayDismiss,
}: {
    slide: any,
    presentationId?: string,
    isEditMode: boolean,
    theme?: any,
    fonts?: unknown,
    renderIndex?: number,
    displayScale?: number,
    enableViewportCulling?: boolean,
    isSelected?: boolean,
    showBlankPromptOverlay?: boolean,
    onBlankPromptOverlayDismiss?: () => void,
    showTemplatePromptOverlay?: boolean,
    onTemplatePromptOverlayDismiss?: () => void,
    enableEditMode?: boolean,
    presentationLayout?: unknown,
}) => {


    const safeSlide = slide ?? {};

    const isBlankSlide = isBlankPresentationSlide(safeSlide);
    const isTemplateV2Slide = isTemplateV2PresentationSlide(safeSlide);





    const templateV2Layout = useMemo(() => {
        if (!isTemplateV2Slide) return null;

        const slideUi = safeSlide.ui;
        return slideUi &&
            typeof slideUi === "object" &&
            !Array.isArray(slideUi)
            ? slideUi as TemplateV2Layout
            : null;
    }, [isTemplateV2Slide, safeSlide.ui]);



    if (isBlankSlide) {
        if (!isTemplateV2Slide) {
            return <div className="h-full w-full bg-white" />;
        }
    }

    const directLayout = templateV2Layout ??
        (isBlankSlide ? BLANK_TEMPLATE_V2_LAYOUT : null);


    return (
        <SlideErrorBoundary label={`Slide ${(safeSlide.index ?? 0) + 1}`}>
            <div className="relative h-full w-full">
                <TemplateV2KonvaSlide
                    layout={directLayout ?? BLANK_TEMPLATE_V2_LAYOUT}
                    isEditMode={isEditMode}
                    slideId={safeSlide.id ?? null}
                    presentationId={presentationId}
                    slideIndex={safeSlide.index ?? 0}
                    renderIndex={renderIndex}
                    fonts={fonts}
                    displayScale={displayScale}
                    enableViewportCulling={enableViewportCulling}
                    isSelected={isSelected}
                />
                {isEditMode &&
                    ((showBlankPromptOverlay && isBlankSlide) ||
                        (showTemplatePromptOverlay && !isBlankSlide)) ? (
                    <TemplateV2PromptOverlay
                        layout={directLayout ?? BLANK_TEMPLATE_V2_LAYOUT}
                        slideIndex={safeSlide.index ?? 0}
                        showLayoutPreview={!isBlankSlide}
                        onDismiss={
                            isBlankSlide
                                ? onBlankPromptOverlayDismiss
                                : onTemplatePromptOverlayDismiss
                        }
                    />
                ) : null}
            </div>
        </SlideErrorBoundary>
    );







};

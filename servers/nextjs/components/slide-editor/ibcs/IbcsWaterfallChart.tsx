"use client";

import { useEffect, useMemo, useState } from "react";
import { Image as KonvaImage, Rect, Group } from "react-konva";
import { ibcsFormatFromConfig } from "@/components/slide-editor/ibcs/format";
import { renderIbcsWaterfallSvg } from "@/components/slide-editor/ibcs/waterfall-svg";
import type { IbcsTableMember } from "@/components/slide-editor/ibcs/table-columns";
import {
  IBCS_WATERFALL_FROM_DEFAULT,
  previousYear,
  resolveCurrentYear,
} from "@/components/slide-editor/ibcs/spec";
import type { IbcsChartConfig, IbcsVarianceBaseline } from "@/components/slide-editor/types";
import {
  asRecord,
  readString,
  type RawElement,
} from "@/components/slide-editor/model/core";

export function isIbcsWaterfall(element: { ibcs?: unknown } | null | undefined) {
  return asRecord(element?.ibcs)?.kind === "waterfall";
}

/** Default REAL PY / REAL AC labels derived from the configured year. */
export function ibcsWaterfallDefaultLabels(
  ibcs: Pick<IbcsChartConfig, "current_year" | "bridge_from"> | null | undefined,
): { start: string; end: string } {
  const year = resolveCurrentYear(ibcs?.current_year);
  const from = ibcs?.bridge_from ?? IBCS_WATERFALL_FROM_DEFAULT;
  const startYear = from === "py" ? previousYear(year) : year;
  return { start: `REAL ${startYear}`, end: `REAL ${year}` };
}

export function IbcsWaterfallChart({
  element,
  width,
  height,
  interactive,
}: {
  element: RawElement;
  width: number;
  height: number;
  interactive: boolean;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const ibcs = asRecord(element.ibcs) as IbcsChartConfig | null;
  const svg = useMemo(() => {
    const defaults = ibcsWaterfallDefaultLabels(ibcs);
    return renderIbcsWaterfallSvg({
      members: (ibcs?.members as IbcsTableMember[] | undefined) ?? [],
      width,
      height,
      title: readString(element.title),
      format: ibcsFormatFromConfig(ibcs),
      from: (ibcs?.bridge_from as IbcsVarianceBaseline | undefined) ?? undefined,
      startLabel: ibcs?.start_label || defaults.start,
      endLabel: ibcs?.end_label || defaults.end,
      varianceRows: ibcs?.variance_rows ?? undefined,
    });
  }, [element.ibcs, element.title, height, ibcs, width]);

  useEffect(() => {
    if (typeof Image === "undefined") return;
    const next = new Image();
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    let revoked = false;
    next.onload = () => {
      setImage(next);
      if (!revoked) {
        URL.revokeObjectURL(url);
        revoked = true;
      }
    };
    next.onerror = () => {
      setImage(null);
      if (!revoked) {
        URL.revokeObjectURL(url);
        revoked = true;
      }
    };
    next.src = url;
    return () => {
      if (!revoked) URL.revokeObjectURL(url);
    };
  }, [svg]);

  return (
    <Group listening={interactive}>
      <Rect width={width} height={height} fill="#FFFFFF" />
      {image ? (
        <KonvaImage
          image={image}
          listening={false}
          perfectDrawEnabled={false}
          shadowForStrokeEnabled={false}
          width={width}
          height={height}
        />
      ) : null}
    </Group>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Image as KonvaImage, Rect, Group } from "react-konva";
import { ibcsFormatFromConfig } from "@/components/slide-editor/ibcs/format";
import { ibcsValuesFromChart } from "@/components/slide-editor/ibcs/values";
import { renderIbcsKpiPinSvg } from "@/components/slide-editor/ibcs/kpi-pin-svg";
import type { IbcsChartConfig } from "@/components/slide-editor/types";
import {
  asRecord,
  readString,
  type RawElement,
} from "@/components/slide-editor/model/core";

export function IbcsKpiChart({
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
  const svg = useMemo(
    () =>
      renderIbcsKpiPinSvg({
        values: ibcsValuesFromChart({
          ibcs,
          categories: Array.isArray(element.categories)
            ? (element.categories as string[])
            : [],
          series: Array.isArray(element.series)
            ? (element.series as Array<{ values: number[] }>)
            : [],
        }),
        pinVs: ibcs?.pin_vs === "py" || ibcs?.pin_vs === "pl" ? ibcs.pin_vs : "fc",
        width,
        height,
        title: readString(element.title),
        format: ibcsFormatFromConfig(ibcs),
        barWidth: ibcs?.bar_width,
      }),
    [element.categories, element.ibcs, element.series, element.title, height, ibcs, width],
  );

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
      <Rect width={width} height={height} fill="rgba(0,0,0,0)" />
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

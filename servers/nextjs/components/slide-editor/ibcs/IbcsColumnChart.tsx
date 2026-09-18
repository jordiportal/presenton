"use client";

import { useEffect, useMemo, useState } from "react";
import { Image as KonvaImage, Rect, Group } from "react-konva";
import { ibcsFormatFromConfig } from "@/components/slide-editor/ibcs/format";
import { renderIbcsColumnSvg } from "@/components/slide-editor/ibcs/column-svg";
import type { IbcsTableMember } from "@/components/slide-editor/ibcs/table-columns";
import type { IbcsChartConfig } from "@/components/slide-editor/types";
import {
  asRecord,
  readString,
  type RawElement,
} from "@/components/slide-editor/model/core";

export function isIbcsColumn(element: { ibcs?: unknown } | null | undefined) {
  return asRecord(element?.ibcs)?.kind === "column";
}

export function IbcsColumnChart({
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
      renderIbcsColumnSvg({
        members: (ibcs?.members as IbcsTableMember[] | undefined) ?? [],
        width,
        height,
        title: readString(element.title),
        format: ibcsFormatFromConfig(ibcs),
        overlayBaseline: ibcs?.overlay_baseline ?? undefined,
        varianceRows: ibcs?.variance_rows ?? undefined,
        showTotal: ibcs?.show_total ?? undefined,
      }),
    [element.ibcs, element.title, height, ibcs, width],
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

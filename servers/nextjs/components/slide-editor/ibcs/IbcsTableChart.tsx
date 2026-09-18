"use client";

import { useEffect, useMemo, useState } from "react";
import { Image as KonvaImage, Rect, Group } from "react-konva";
import { ibcsFormatFromConfig } from "@/components/slide-editor/ibcs/format";
import { renderIbcsTableSvg } from "@/components/slide-editor/ibcs/table-svg";
import type { IbcsTableColumn, IbcsTableMember } from "@/components/slide-editor/ibcs/table-columns";
import type { IbcsChartConfig } from "@/components/slide-editor/types";
import { asRecord, type RawElement } from "@/components/slide-editor/model/core";

export function isIbcsTable(element: { ibcs?: unknown } | null | undefined) {
  return asRecord(element?.ibcs)?.kind === "table";
}

export function IbcsTableChart({
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
      renderIbcsTableSvg({
        members: (ibcs?.members as IbcsTableMember[] | undefined) ?? [],
        columns: ibcs?.columns as IbcsTableColumn[] | undefined,
        width,
        height,
        format: ibcsFormatFromConfig(ibcs),
      }),
    [element.ibcs, height, ibcs, width],
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

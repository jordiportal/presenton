"use client";

import { useEffect, useMemo, useState } from "react";
import { Image as KonvaImage, Rect, Group } from "react-konva";
import { renderSimulationTableSvg } from "@/components/slide-editor/simulation/matrix-svg";
import { simulationFormatFromConfig } from "@/components/slide-editor/simulation/spec";
import type {
  SimulationColumnPref,
  SimulationConfig,
  SimulationSnapshot,
} from "@/components/slide-editor/types";
import { asRecord, type RawElement } from "@/components/slide-editor/model/core";

export function isSimulationTable(
  element: { simulation?: unknown } | null | undefined,
): boolean {
  return Boolean(asRecord(element?.simulation));
}

export function SimulationTableChart({
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
  const simulation = asRecord(element.simulation) as SimulationConfig | null;
  const svg = useMemo(
    () =>
      renderSimulationTableSvg({
        snapshot: (simulation?.snapshot as SimulationSnapshot | undefined) ?? null,
        width,
        height,
        format: simulationFormatFromConfig(simulation),
        columnPrefs:
          (simulation?.columns as SimulationColumnPref[] | undefined) ?? null,
      }),
    [element.simulation, height, simulation, width],
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

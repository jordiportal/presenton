"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import type Konva from "konva";
import { FilterWidget } from "@/components/slide-editor/filters/FilterWidget";
import { isFilterElement } from "@/components/slide-editor/filters/filter-model";
import {
  keyForSelection,
  readArray,
  readString,
  asRecord,
  ROOT_ELEMENTS_COMPONENT_INDEX,
  type ElementSelection,
  type RawUi,
} from "@/components/slide-editor/model/model";
import type { FilterElement } from "@/components/slide-editor/types";

type Descriptor = {
  element: FilterElement;
  key: string;
  selection: ElementSelection;
};

export function FilterOverlay({
  isEditMode,
  nodeRefs,
  revision,
  ui,
  onOpenEditor,
  onSelectedChange,
}: {
  isEditMode: boolean;
  nodeRefs: RefObject<Map<string, Konva.Node>>;
  revision: number;
  ui: RawUi;
  onOpenEditor: (selection: ElementSelection) => void;
  onSelectedChange: (selection: ElementSelection, selected: string[]) => void;
}) {
  const elementRefs = useRef(new Map<string, HTMLDivElement>());
  const descriptors = useMemo(() => collectFilters(ui), [ui]);

  useLayoutEffect(() => {
    const sync = () => {
      descriptors.forEach(({ key }) => {
        const htmlElement = elementRefs.current.get(key);
        const konvaNode = nodeRefs.current?.get(key);
        if (!htmlElement || !konvaNode) {
          if (htmlElement) htmlElement.style.display = "none";
          return;
        }
        const matrix = konvaNode.getAbsoluteTransform().getMatrix();
        htmlElement.style.display = konvaNode.isVisible() ? "flex" : "none";
        htmlElement.style.width = `${konvaNode.width()}px`;
        htmlElement.style.height = `${konvaNode.height()}px`;
        htmlElement.style.transform = `matrix(${matrix.join(",")})`;
      });
    };

    sync();
    const stage = Array.from(nodeRefs.current?.values() ?? [])
      .map((node) => node.getStage())
      .find(Boolean);
    if (!stage) return;
    const layers = stage.getLayers();
    stage.on("dragmove.filterOverlay transform.filterOverlay", sync);
    layers.forEach((layer) => layer.on("draw.filterOverlay", sync));
    return () => {
      stage.off("dragmove.filterOverlay transform.filterOverlay", sync);
      layers.forEach((layer) => layer.off("draw.filterOverlay", sync));
    };
  }, [descriptors, nodeRefs, revision]);

  return (
    <div
      data-template-v2-filter-layer="true"
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 6 }}
    >
      {descriptors.map(({ element, key, selection }) => (
        <div
          key={key}
          ref={(node) => {
            if (node) elementRefs.current.set(key, node);
            else elementRefs.current.delete(key);
          }}
          className="absolute left-0 top-0 flex flex-col origin-top-left"
          style={{ pointerEvents: "none" }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            if (isEditMode) onOpenEditor(selection);
          }}
        >
          <div
            className="flex h-[22px] shrink-0 items-center px-1 text-[10px] font-semibold uppercase tracking-wide text-[#667085]"
            style={{ pointerEvents: "none" }}
          >
            {element.label || "Filtro"}
          </div>
          <div
            className="min-h-0 min-w-0 flex-1 px-1 pb-1"
            style={{ pointerEvents: "auto" }}
          >
            <FilterWidget
              element={element}
              interactive
              onChange={(selected) => onSelectedChange(selection, selected)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function collectFilters(ui: RawUi): Descriptor[] {
  const found: Descriptor[] = [];
  const visit = (
    elements: unknown[],
    componentIndex: number,
    parentPath: number[],
  ) => {
    elements.forEach((item, index) => {
      const record = asRecord(item);
      if (!record) return;
      const elementPath = [...parentPath, index];
      const selection: ElementSelection = {
        kind: "element",
        componentIndex,
        elementPath,
      };
      if (isFilterElement(record)) {
        found.push({
          element: record,
          key: keyForSelection(selection),
          selection,
        });
        return;
      }
      const children = readArray(record.children);
      if (children.length) visit(children, componentIndex, elementPath);
      if (readString(record.type) === "container" && record.child) {
        visit([record.child], componentIndex, elementPath);
      }
    });
  };

  visit(readArray(ui.elements), ROOT_ELEMENTS_COMPONENT_INDEX, []);
  readArray(ui.components).forEach((component, componentIndex) => {
    const record = asRecord(component);
    if (!record) return;
    visit(readArray(record.elements), componentIndex, []);
  });
  return found;
}

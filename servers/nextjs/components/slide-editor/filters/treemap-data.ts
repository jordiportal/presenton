import type { Kh7DimensionValue, Kh7ExecuteResponse } from "@/app/(presentation-generator)/services/api/kh7";
import type { TreemapNode } from "@/components/slide-editor/filters/treemap-layout";

const CATEGORY_JOIN = " · ";
const MAX_PARENTS = 14;
const MAX_CHILDREN = 18;

function matchCode(
  caption: string,
  values: Kh7DimensionValue[],
): { code: string; caption: string } {
  const label = caption.trim();
  const exact = values.find(
    (item) => item.caption === label || item.code === label,
  );
  if (exact) return { code: String(exact.code), caption: exact.caption || label };
  const loose = values.find(
    (item) =>
      item.caption?.toLowerCase() === label.toLowerCase() ||
      item.code?.toLowerCase() === label.toLowerCase(),
  );
  if (loose) return { code: String(loose.code), caption: loose.caption || label };
  return { code: label, caption: label };
}

function splitCategory(label: string, hasChild: boolean) {
  if (!hasChild) return { parent: label, child: null as string | null };
  const index = label.indexOf(CATEGORY_JOIN);
  if (index === -1) return { parent: label, child: null as string | null };
  return {
    parent: label.slice(0, index).trim(),
    child: label.slice(index + CATEGORY_JOIN.length).trim() || null,
  };
}

export function buildTreemapNodes(
  result: Kh7ExecuteResponse,
  input: {
    hasChild: boolean;
    parentValues?: Kh7DimensionValue[];
    childValues?: Kh7DimensionValue[];
  },
): TreemapNode[] {
  const categories = result.chart?.categories ?? [];
  const values = result.chart?.series?.[0]?.values ?? [];
  const parents = new Map<
    string,
    { node: TreemapNode; children: Map<string, TreemapNode> }
  >();

  categories.forEach((category, index) => {
    const raw = String(category ?? "").trim();
    if (!raw) return;
    const value = Math.abs(Number(values[index]) || 0);
    if (value <= 0) return;
    const parts = splitCategory(raw, input.hasChild);
    const parent = matchCode(parts.parent, input.parentValues ?? []);
    let group = parents.get(parent.code);
    if (!group) {
      group = {
        node: {
          code: parent.code,
          caption: parent.caption,
          value: 0,
          children: [],
        },
        children: new Map(),
      };
      parents.set(parent.code, group);
    }
    group.node.value += value;
    if (!parts.child) return;
    const child = matchCode(parts.child, input.childValues ?? []);
    const current = group.children.get(child.code);
    if (current) {
      current.value += value;
      return;
    }
    group.children.set(child.code, {
      code: child.code,
      caption: child.caption,
      value,
      parentCode: parent.code,
    });
  });

  return [...parents.values()]
    .sort((left, right) => right.node.value - left.node.value)
    .slice(0, MAX_PARENTS)
    .map(({ node, children }) => {
      const nested = [...children.values()]
        .sort((left, right) => right.value - left.value)
        .slice(0, MAX_CHILDREN);
      return {
        ...node,
        children: nested.length ? nested : null,
      };
    });
}

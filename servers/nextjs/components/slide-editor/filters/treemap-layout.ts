export type TreemapNode = {
  code: string;
  caption: string;
  value: number;
  parentCode?: string | null;
  children?: TreemapNode[] | null;
};

export type TreemapCell = {
  code: string;
  caption: string;
  value: number;
  parentCode?: string | null;
  depth: number;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  header?: boolean;
};

export const TREEMAP_PALETTE = [
  "#7CB342",
  "#5C6BC0",
  "#EF5350",
  "#F9A825",
  "#AB47BC",
  "#26A69A",
  "#42A5F5",
  "#8D6E63",
  "#EC407A",
  "#78909C",
];

const HEADER_H = 20;
const GAP = 1.2;

export const TREEMAP_EXAMPLE: TreemapNode[] = [
  {
    code: "SUPER",
    caption: "SUPER",
    value: 38,
    children: [
      { code: "GCO", caption: "GRUPO CO...", value: 10, parentCode: "SUPER" },
      { code: "BON", caption: "BON...", value: 6, parentCode: "SUPER" },
      { code: "AH", caption: "AH...", value: 5, parentCode: "SUPER" },
      { code: "CONDIS", caption: "CONDIS", value: 4, parentCode: "SUPER" },
      { code: "UVESCO", caption: "UVESCO", value: 4, parentCode: "SUPER" },
      { code: "GADISA", caption: "GADISA", value: 4, parentCode: "SUPER" },
      { code: "DINOS", caption: "DINOS...", value: 5, parentCode: "SUPER" },
    ],
  },
  {
    code: "HIPER",
    caption: "HIPER",
    value: 22,
    children: [
      { code: "GCOH", caption: "GRUPO ...", value: 8, parentCode: "HIPER" },
      { code: "GRUP", caption: "GRUP...", value: 5, parentCode: "HIPER" },
      { code: "ALCAMPO", caption: "ALCAMPO, ...", value: 6, parentCode: "HIPER" },
      { code: "ELC", caption: "EL ...", value: 3, parentCode: "HIPER" },
    ],
  },
  {
    code: "CHILE",
    caption: "Chile",
    value: 16,
    children: [
      { code: "TRYP", caption: "TRANSPORTE Y...", value: 16, parentCode: "CHILE" },
    ],
  },
  {
    code: "MAYORISTAS",
    caption: "MAYORISTAS",
    value: 14,
    children: [
      { code: "MARV", caption: "MARVIMU...", value: 6, parentCode: "MAYORISTAS" },
      { code: "MIQ", caption: "MIQUEL A...", value: 5, parentCode: "MAYORISTAS" },
      { code: "CA", caption: "CA...", value: 3, parentCode: "MAYORISTAS" },
    ],
  },
  {
    code: "DISCOUNT",
    caption: "DISCOUNT",
    value: 12,
    children: [
      { code: "LIDL", caption: "LIDL SUPER...", value: 8, parentCode: "DISCOUNT" },
      { code: "GRU", caption: "GRU...", value: 4, parentCode: "DISCOUNT" },
    ],
  },
  {
    code: "MERCADONA",
    caption: "MERCADONA",
    value: 18,
    children: [
      { code: "MSA", caption: "MERCADONA, S.A.", value: 18, parentCode: "MERCADONA" },
    ],
  },
  {
    code: "ISRAEL",
    caption: "Israel",
    value: 10,
    children: [
      { code: "JACK", caption: "JACK JACOBI AND SON...", value: 10, parentCode: "ISRAEL" },
    ],
  },
  {
    code: "CROACIA",
    caption: "Croacia",
    value: 8,
    children: [
      { code: "ROX", caption: "ROX D.O.O.", value: 8, parentCode: "CROACIA" },
    ],
  },
];

export function findTreemapNode(
  nodes: TreemapNode[] | null | undefined,
  code: string,
): TreemapNode | null {
  if (!code || !nodes?.length) return null;
  for (const node of nodes) {
    if (node.code === code) return node;
    const nested = findTreemapNode(node.children ?? [], code);
    if (nested) {
      return {
        ...nested,
        parentCode: nested.parentCode ?? node.code,
      };
    }
  }
  return null;
}

export function flattenTreemapNodes(nodes: TreemapNode[] | null | undefined): TreemapNode[] {
  const out: TreemapNode[] = [];
  for (const node of nodes ?? []) {
    out.push(node);
    if (node.children?.length) out.push(...flattenTreemapNodes(node.children));
  }
  return out;
}

function mixHex(hex: string, withColor: string, amount: number): string {
  const a = parseHex(hex);
  const b = parseHex(withColor);
  const t = Math.min(1, Math.max(0, amount));
  const ch = (left: number, right: number) =>
    Math.round(left + (right - left) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(a.r, b.r)}${ch(a.g, b.g)}${ch(a.b, b.b)}`;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const raw = hex.replace("#", "");
  const value = raw.length === 3
    ? raw.split("").map((item) => item + item).join("")
    : raw.padEnd(6, "0").slice(0, 6);
  return {
    r: Number.parseInt(value.slice(0, 2), 16) || 0,
    g: Number.parseInt(value.slice(2, 4), 16) || 0,
    b: Number.parseInt(value.slice(4, 6), 16) || 0,
  };
}

function parentColor(index: number): string {
  return TREEMAP_PALETTE[index % TREEMAP_PALETTE.length];
}

function childColor(base: string, index: number, count: number): string {
  const t = count <= 1 ? 0.12 : 0.08 + (index / Math.max(1, count - 1)) * 0.28;
  return mixHex(base, "#FFFFFF", t);
}

function nodeValue(node: TreemapNode): number {
  if (node.children?.length) {
    const sum = node.children.reduce((total, item) => total + nodeValue(item), 0);
    return Math.max(Math.abs(node.value) || 0, sum);
  }
  return Math.max(0, Math.abs(node.value) || 0);
}

function splitLayout(
  items: Array<{ node: TreemapNode; value: number }>,
  x: number,
  y: number,
  width: number,
  height: number,
  colorFor: (node: TreemapNode, index: number) => string,
  depth: number,
  offset: number,
): TreemapCell[] {
  if (!items.length || width <= 0 || height <= 0) return [];
  if (items.length === 1) {
    const item = items[0];
    return [
      {
        code: item.node.code,
        caption: item.node.caption,
        value: item.value,
        parentCode: item.node.parentCode ?? null,
        depth,
        color: colorFor(item.node, offset),
        x,
        y,
        width,
        height,
      },
    ];
  }
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  let acc = 0;
  let cut = 0;
  for (let index = 0; index < items.length - 1; index += 1) {
    acc += items[index].value;
    cut = index;
    if (acc >= total / 2) break;
  }
  const left = items.slice(0, cut + 1);
  const right = items.slice(cut + 1);
  const leftSum = left.reduce((sum, item) => sum + item.value, 0);
  const ratio = leftSum / total;
  if (width >= height) {
    const leftW = width * ratio;
    return [
      ...splitLayout(left, x, y, leftW, height, colorFor, depth, offset),
      ...splitLayout(
        right,
        x + leftW,
        y,
        width - leftW,
        height,
        colorFor,
        depth,
        offset + left.length,
      ),
    ];
  }
  const leftH = height * ratio;
  return [
    ...splitLayout(left, x, y, width, leftH, colorFor, depth, offset),
    ...splitLayout(
      right,
      x,
      y + leftH,
      width,
      height - leftH,
      colorFor,
      depth,
      offset + left.length,
    ),
  ];
}

function squarify(
  nodes: TreemapNode[],
  x: number,
  y: number,
  width: number,
  height: number,
  colorFor: (node: TreemapNode, index: number) => string,
  depth: number,
): TreemapCell[] {
  const items = nodes
    .map((node) => ({ node, value: nodeValue(node) }))
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value);
  return splitLayout(items, x, y, width, height, colorFor, depth, 0);
}

export function layoutTreemap(
  nodes: TreemapNode[] | null | undefined,
  width: number,
  height: number,
): TreemapCell[] {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  if (!nodes?.length || w < 4 || h < 4) return [];
  const parents = squarify(
    nodes,
    0,
    0,
    w,
    h,
    (_node, index) => parentColor(index),
    0,
  );
  const cells: TreemapCell[] = [];
  parents.forEach((parent, parentIndex) => {
    const source = nodes.find((item) => item.code === parent.code);
    const children = source?.children?.filter((item) => nodeValue(item) > 0) ?? [];
    const color = parentColor(parentIndex);
    const padded = {
      x: parent.x + GAP,
      y: parent.y + GAP,
      width: Math.max(0, parent.width - GAP * 2),
      height: Math.max(0, parent.height - GAP * 2),
    };
    if (!children.length) {
      cells.push({ ...parent, ...padded, color, header: false, depth: 0 });
      return;
    }
    const showHeader = padded.height > HEADER_H + 16;
    cells.push({
      ...parent,
      ...padded,
      color,
      header: true,
      depth: 0,
    });
    if (!showHeader) {
      const childCells = squarify(
        children,
        padded.x,
        padded.y,
        padded.width,
        padded.height,
        (_node, index) => childColor(color, index, children.length),
        1,
      );
      cells.push(
        ...childCells.map((cell) => ({
          ...cell,
          parentCode: parent.code,
        })),
      );
      return;
    }
    const childCells = squarify(
      children,
      padded.x,
      padded.y + HEADER_H,
      padded.width,
      Math.max(0, padded.height - HEADER_H),
      (_node, index) => childColor(color, index, children.length),
      1,
    );
    cells.push(
      ...childCells.map((cell) => ({
        ...cell,
        parentCode: parent.code,
      })),
    );
  });
  return cells;
}

export function isTreemapCellActive(
  cell: TreemapCell,
  selected: string[] | Set<string> | null | undefined,
  nodes?: TreemapNode[] | null,
): boolean {
  const selectedSet =
    selected instanceof Set ? selected : new Set(selected ?? []);
  if (selectedSet.size === 0) return true;
  if (selectedSet.has(cell.code)) return true;
  if (cell.parentCode && selectedSet.has(cell.parentCode)) return true;
  if (cell.depth === 0) {
    for (const code of selectedSet) {
      const node = findTreemapNode(nodes, code);
      if (node?.parentCode === cell.code) return true;
    }
  }
  return false;
}

export function hitTreemapCell(
  cells: TreemapCell[],
  x: number,
  y: number,
): TreemapCell | null {
  let found: TreemapCell | null = null;
  for (const cell of cells) {
    if (
      x >= cell.x &&
      y >= cell.y &&
      x <= cell.x + cell.width &&
      y <= cell.y + cell.height
    ) {
      if (!found || cell.depth >= found.depth) found = cell;
    }
  }
  return found;
}

import assert from "node:assert/strict";
import test from "node:test";

import { buildTreemapNodes } from "../components/slide-editor/filters/treemap-data.ts";
import {
  TREEMAP_EXAMPLE,
  findTreemapNode,
  hitTreemapCell,
  isTreemapCellActive,
  layoutTreemap,
} from "../components/slide-editor/filters/treemap-layout.ts";
import { renderTreemapSvg } from "../components/slide-editor/filters/treemap-svg.ts";

test("treemap layout fills the canvas without overlapping parents", () => {
  const cells = layoutTreemap(TREEMAP_EXAMPLE, 800, 400);
  const parents = cells.filter((item) => item.depth === 0);
  assert.ok(parents.length >= 6);
  const area = parents.reduce((sum, item) => sum + item.width * item.height, 0);
  assert.ok(area > 800 * 400 * 0.9);
  const chile = hitTreemapCell(cells, 10, 10);
  assert.ok(chile);
});

test("clicking a child prefers the nested cell over the parent", () => {
  const cells = layoutTreemap(TREEMAP_EXAMPLE, 800, 400);
  const child = cells.find((item) => item.depth === 1 && item.code === "LIDL");
  assert.ok(child);
  const hit = hitTreemapCell(
    cells,
    child.x + child.width / 2,
    child.y + child.height / 2,
  );
  assert.equal(hit?.code, "LIDL");
  assert.equal(hit?.parentCode, "DISCOUNT");
});

test("buildTreemapNodes groups parent · child categories", () => {
  const nodes = buildTreemapNodes(
    {
      query_id: "q",
      query_name: "q",
      chart: {
        categories: ["SUPER · LIDL", "SUPER · CONDIS", "HIPER · ALCAMPO"],
        series: [{ name: "UN", values: [10, 4, 8] }],
        columns: [],
        rows: [],
      },
      table: { columns: [], rows: [] },
      sql: null,
      execution_time_ms: 1,
      source: "mock",
      row_count: 3,
    },
    {
      hasChild: true,
      parentValues: [
        { code: "SUPER", caption: "SUPER" },
        { code: "HIPER", caption: "HIPER" },
      ],
      childValues: [
        { code: "LIDL", caption: "LIDL" },
        { code: "CONDIS", caption: "CONDIS" },
        { code: "ALCAMPO", caption: "ALCAMPO" },
      ],
    },
  );
  assert.equal(nodes.length, 2);
  const superNode = findTreemapNode(nodes, "SUPER");
  assert.equal(superNode?.value, 14);
  assert.equal(superNode?.children?.length, 2);
});

test("treemap SVG includes labels and selected dimming hooks", () => {
  const svg = renderTreemapSvg({
    nodes: TREEMAP_EXAMPLE,
    width: 720,
    height: 360,
    selected: ["SUPER"],
  });
  assert.match(svg, /SUPER/);
  assert.match(svg, /MERCADONA/);
  assert.match(svg, /opacity="0.38"/);
});

test("selecting a child keeps the parent group highlighted", () => {
  const cells = layoutTreemap(TREEMAP_EXAMPLE, 800, 400);
  const parent = cells.find((item) => item.depth === 0 && item.code === "DISCOUNT");
  const child = cells.find((item) => item.depth === 1 && item.code === "LIDL");
  const sibling = cells.find((item) => item.depth === 1 && item.code === "GRU");
  const other = cells.find((item) => item.depth === 0 && item.code === "SUPER");
  assert.ok(parent && child && sibling && other);
  assert.equal(isTreemapCellActive(parent, ["LIDL"], TREEMAP_EXAMPLE), true);
  assert.equal(isTreemapCellActive(child, ["LIDL"], TREEMAP_EXAMPLE), true);
  assert.equal(isTreemapCellActive(sibling, ["LIDL"], TREEMAP_EXAMPLE), false);
  assert.equal(isTreemapCellActive(other, ["LIDL"], TREEMAP_EXAMPLE), false);
});

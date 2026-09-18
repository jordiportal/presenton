import assert from "node:assert/strict";
import test from "node:test";

import { mergeIbcsConfig } from "../components/slide-editor/ibcs/spec.ts";
import { renderIbcsTableSvg } from "../components/slide-editor/ibcs/table-svg.ts";
import {
  defaultIbcsTableColumns,
  formatIbcsTableCell,
  ibcsTableToGrid,
  withIbcsTableTotal,
} from "../components/slide-editor/ibcs/table-columns.ts";

const MEMBERS = [
  {
    code: "Resto",
    caption: "Resto",
    ac: 10_300_000,
    py: 13_400_000,
    pl: 13_900_000,
    fc: 13_500_000,
  },
  {
    code: "Antical",
    caption: "Antical",
    ac: 1_900_000,
    py: 1_800_000,
    pl: 2_200_000,
    fc: 2_200_000,
  },
];

test("default IBCS table columns match Inforiver-style comparatives", () => {
  const columns = defaultIbcsTableColumns();
  assert.deepEqual(
    columns.map((item) => [item.role, item.viz, item.label]),
    [
      ["label", "text", ""],
      ["py", "number", "PY"],
      ["pl", "number", "PL"],
      ["fc", "number", "FC"],
      ["ac", "bar", "AC"],
      ["delta_py", "variance", "ΔPY"],
      ["pct_py", "percent", "ΔPY%"],
      ["delta_pl", "variance", "ΔPL"],
      ["pct_pl", "percent", "ΔPL%"],
      ["delta_fc", "variance_hatched", "ΔFC"],
      ["pct_fc", "percent", "ΔFC%"],
    ],
  );
});

test("IBCS table grid starts with Total and compact numbers", () => {
  const grid = ibcsTableToGrid(MEMBERS, defaultIbcsTableColumns());
  assert.equal(grid[0][1], "PY");
  assert.equal(grid[0][4], "AC");
  assert.equal(grid[1][0], "Total");
  assert.equal(grid[1][4], "12,2M");
  assert.equal(grid[2][0], "Resto");
  assert.match(grid[2][6], /-/);
});

test("withIbcsTableTotal sums scenario values", () => {
  const [total] = withIbcsTableTotal(MEMBERS);
  assert.equal(total.caption, "Total");
  assert.equal(total.ac, 12_200_000);
  assert.equal(total.py, 15_200_000);
});

test("percent cells keep the signed IBCS format", () => {
  const pct = defaultIbcsTableColumns().find((item) => item.role === "pct_fc");
  assert.ok(pct);
  assert.equal(formatIbcsTableCell(pct, MEMBERS[0]), "-23,7%");
});

test("IBCS table SVG draws bars, variance and hatched forecast", () => {
  const svg = renderIbcsTableSvg({
    members: MEMBERS,
    columns: defaultIbcsTableColumns(),
    width: 1120,
    height: 280,
  });
  assert.match(svg, /Total/);
  assert.match(svg, />PY</);
  assert.match(svg, />AC</);
  assert.match(svg, /ΔFC/);
  assert.match(svg, /pattern /);
  assert.match(svg, /12,2M/);
  assert.match(svg, /#E11D2E/);
  assert.match(svg, /#12B76A/);
  assert.match(svg, /clipPath/);
});

test("IBCS table cells clip bars and labels to their column", () => {
  const svg = renderIbcsTableSvg({
    members: MEMBERS,
    columns: defaultIbcsTableColumns(),
    width: 900,
    height: 220,
    format: { unit: "UN", scale: "auto" },
  });
  const clips = [...svg.matchAll(/clip-path="url\(#([^"]+)"/g)].map((item) => item[1]);
  assert.ok(clips.length >= 12);
  assert.match(svg, /clipPath id="t900x220-c4r0"/);
  assert.doesNotMatch(svg, /24,5M UN UN/);
});

test("mergeIbcsConfig keeps table kind and members", () => {
  const merged = mergeIbcsConfig(
    { kind: "table", members: MEMBERS, pin_vs: "fc" },
    { scale: "millions", scale_label: "Millones" },
  );
  assert.equal(merged.kind, "table");
  assert.equal(merged.scale, "millions");
  assert.equal(merged.members?.length, 2);
});

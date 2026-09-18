import assert from "node:assert/strict";
import test from "node:test";

import {
  isYearMonthDimension,
  resolveFilterCodes,
} from "../components/slide-editor/filters/filter-model.ts";

test("Mes natural (0CALMONTH2) keeps MM codes instead of YYYYMM", () => {
  const options = [
    { code: "01", caption: "ENE" },
    { code: "06", caption: "JUN" },
  ];
  assert.deepEqual(
    resolveFilterCodes(["06"], options, ["2026"], "0CALMONTH2"),
    ["06"],
  );
  assert.equal(isYearMonthDimension("0CALMONTH2"), false);
});

test("0CALMONTH composes year and month for BW year-month members", () => {
  const options = [
    { code: "202601", caption: "ENE 2026" },
    { code: "202606", caption: "JUN 2026" },
  ];
  assert.deepEqual(
    resolveFilterCodes(["06"], options, ["2026"], "0CALMONTH"),
    ["202606"],
  );
  assert.equal(isYearMonthDimension("0CALMONTH"), true);
});

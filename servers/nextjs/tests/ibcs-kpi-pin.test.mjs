import assert from "node:assert/strict";
import test from "node:test";

import {
  formatCompact,
  formatPercent,
  varianceRatio,
} from "../components/slide-editor/ibcs/format.ts";
import { renderIbcsKpiPinSvg } from "../components/slide-editor/ibcs/kpi-pin-svg.ts";
import {
  IBCS_KPI_PIN,
  IBCS_KPI_PIN_EXAMPLE,
  previousYear,
  scenarioFilters,
  specFromConfig,
} from "../components/slide-editor/ibcs/spec.ts";

test("formatCompact uses European compact units", () => {
  assert.equal(formatCompact(25_600_000), "25,6M");
  assert.equal(formatCompact(-720_700), "-720,7K");
});

test("formatCompact respects millions grouping and BI unit", () => {
  assert.equal(
    formatCompact(25_600_000, {
      scale: "millions",
      scaleLabel: "Millones",
      unit: "EUR",
      decimals: 1,
    }),
    "25,6 Millones EUR",
  );
  assert.equal(
    formatCompact(25_600_000, { scale: "none", unit: "EUR", decimals: 0 }),
    "25.600.000 EUR",
  );
  assert.equal(formatCompact(12.4, { unit: "%", decimals: 1 }), "12,4%");
});

test("variance alarms match the first KPI pin example", () => {
  const { ac, py, fc, pl } = IBCS_KPI_PIN_EXAMPLE;
  assert.equal(formatPercent(varianceRatio(ac, py)), "+4,6%");
  assert.equal(formatPercent(varianceRatio(ac, fc)), "-2,7%");
  assert.equal(formatPercent(varianceRatio(ac, pl)), "-5,3%");
  assert.equal(formatCompact(ac - fc), "-720,7K");
});

test("KPI pin SVG includes IBCS labels and alarms", () => {
  const svg = renderIbcsKpiPinSvg({
    values: IBCS_KPI_PIN_EXAMPLE,
    pinVs: "fc",
    width: 720,
    height: 400,
  });
  assert.match(svg, /AC AY/);
  assert.match(svg, /25,6M/);
  assert.match(svg, /ΔPY \+4,6%/);
  assert.match(svg, /ΔFC -2,7%/);
  assert.match(svg, /ΔPL -5,3%/);
  assert.match(svg, /-720,7K/);
  assert.match(svg, /#E11D2E/);
  assert.match(svg, /#12B76A/);
});

test("KPI pin SVG uses configured millions suffix, unit and bar width", () => {
  const svg = renderIbcsKpiPinSvg({
    values: IBCS_KPI_PIN_EXAMPLE,
    pinVs: "fc",
    width: 720,
    height: 400,
    format: { scale: "millions", scaleLabel: "Millones", unit: "EUR" },
    barWidth: 22,
  });
  assert.match(svg, /25,6 Millones EUR/);
  assert.match(svg, /width="158"/);
});

test("specFromConfig overrides IBCS dimension mapping", () => {
  const spec = specFromConfig({
    year_dimension: "ZYEAR",
    version_dimension: "ZVERS",
    version_codes: { actual: "R", forecast: "F", plan: "P" },
  });
  const ac = scenarioFilters(spec, spec.scenarios[0], "2026");
  assert.deepEqual(ac, [
    { dimension: "ZYEAR", values: ["2026"] },
    { dimension: "ZVERS", values: ["R"] },
  ]);
});

test("scenario filters encode year and version for each IBCS bucket", () => {
  const ac = scenarioFilters(IBCS_KPI_PIN, IBCS_KPI_PIN.scenarios[0], "2026");
  const py = scenarioFilters(IBCS_KPI_PIN, IBCS_KPI_PIN.scenarios[1], "2026");
  const fc = scenarioFilters(IBCS_KPI_PIN, IBCS_KPI_PIN.scenarios[2], "2026");
  const pl = scenarioFilters(IBCS_KPI_PIN, IBCS_KPI_PIN.scenarios[3], "2026");
  assert.deepEqual(ac, [
    { dimension: "0CALYEAR", values: ["2026"] },
    { dimension: "0VERSION", values: ["#"] },
  ]);
  assert.deepEqual(py, [
    { dimension: "0CALYEAR", values: ["2025"] },
    { dimension: "0VERSION", values: ["#"] },
  ]);
  assert.deepEqual(fc, [
    { dimension: "0CALYEAR", values: ["2026"] },
    { dimension: "0VERSION", values: ["000"] },
  ]);
  assert.deepEqual(pl, [
    { dimension: "0CALYEAR", values: ["2026"] },
    { dimension: "0VERSION", values: ["001"] },
  ]);
  assert.equal(previousYear("2026"), "2025");
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  convertInfographicToListType,
  convertTextListToInfographic,
  infographicDataFromListItems,
  listItemsFromTextList,
  parseListItemText,
} from "../components/slide-editor/infographics/list-to-infographic.ts";

test("parseListItemText splits heading and description", () => {
  assert.deepEqual(parseListItemText("Foundation: Establish strong processes"), {
    heading: "Foundation",
    description: "Establish strong processes",
    value: null,
  });
  assert.equal(
    parseListItemText(
      "• Organic visibility score increased from 62 to 78.",
    ).heading,
    "Organic visibility score increased from 62 to 78",
  );
  assert.equal(parseListItemText("57% Awareness").value, 57);
  assert.equal(parseListItemText("57% Awareness").heading, "Awareness");
});

test("listItemsFromTextList reads text-list runs", () => {
  const items = listItemsFromTextList({
    items: [
      [{ text: "Discover: Research the opportunity." }],
      [{ text: "Launch: Release to customers." }],
    ],
  });
  assert.equal(items.length, 2);
  assert.equal(items[0].heading, "Discover");
  assert.equal(items[0].description, "Research the opportunity.");
});

test("convertTextListToInfographic fills pyramid items in place", () => {
  const infographic = convertTextListToInfographic(
    {
      type: "text-list",
      position: { x: 80, y: 120 },
      size: { width: 400, height: 180 },
      items: [
        [{ text: "Foundation: Base capability." }],
        [{ text: "Growth: Expand reach." }],
        [{ text: "Innovation: New ideas." }],
      ],
      font: { family: "Inter", size: 16, color: "#191919" },
    },
    "pyramid",
  );

  assert.ok(infographic);
  assert.equal(infographic.type, "infographic");
  assert.equal(infographic.data.type, "pyramid");
  assert.equal(infographic.data.items?.length, 3);
  assert.equal(infographic.data.items?.[0].heading, "Foundation");
  assert.equal(infographic.position.x, 80);
  assert.equal(infographic.position.y, 120);
  assert.equal(infographic.size.width, 720);
});

test("convertInfographicToListType remaps items and keeps icons", () => {
  const pyramid = convertTextListToInfographic(
    {
      type: "text-list",
      position: { x: 80, y: 120 },
      size: { width: 400, height: 180 },
      items: [
        [{ text: "Foundation: Base capability." }],
        [{ text: "Growth: Expand reach." }],
        [{ text: "Innovation: New ideas." }],
      ],
      font: { family: "Inter", size: 16, color: "#191919" },
    },
    "pyramid",
  );
  assert.ok(pyramid);
  const funnel = convertInfographicToListType(pyramid, "conversion_funnel");
  assert.ok(funnel);
  assert.equal(funnel.data.type, "conversion_funnel");
  assert.equal(funnel.data.items?.length, 3);
  assert.equal(funnel.data.items?.[0].heading, "Foundation");
  assert.equal(funnel.data.items?.[0].description, "Base capability.");
  assert.equal(convertInfographicToListType(funnel, "conversion_funnel"), null);
});

test("funnel keeps parsed values and fills the rest", () => {
  const data = infographicDataFromListItems("conversion_funnel", [
    { heading: "Awareness", value: 80 },
    { heading: "Intent" },
  ]);
  assert.equal(data.type, "conversion_funnel");
  assert.equal(data.items[0].value, 80);
  assert.ok(data.items[1].value < data.items[0].value);
});


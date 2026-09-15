import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIENCE_MODE,
  PRESENTER_MODE,
  buildPresentationPath,
  formatElapsed,
  isPresentSessionMode,
  parsePresentSessionMessage,
  presentChannelName,
  presenterWindowName,
} from "../app/(presentation-generator)/presentation/utils/presentSession.ts";

test("session mode helpers", () => {
  assert.equal(isPresentSessionMode("present"), true);
  assert.equal(isPresentSessionMode("presenter"), true);
  assert.equal(isPresentSessionMode("edit"), false);
  assert.equal(presentChannelName("deck-1"), "presenton-present:deck-1");
  assert.equal(presenterWindowName("deck-1"), "presenton-presenter-deck-1");
});

test("parse present session messages", () => {
  assert.deepEqual(parsePresentSessionMessage({ type: "slide", index: 3 }), {
    type: "slide",
    index: 3,
  });
  assert.equal(parsePresentSessionMessage({ type: "slide", index: -1 }), null);
  assert.equal(parsePresentSessionMessage({ type: "slide", index: 1.5 }), null);
  assert.deepEqual(parsePresentSessionMessage({ type: "exit" }), { type: "exit" });
  assert.deepEqual(
    parsePresentSessionMessage({
      type: "slide-ui",
      index: 1,
      ui: { elements: [] },
    }),
    { type: "slide-ui", index: 1, ui: { elements: [] } },
  );
  assert.equal(
    parsePresentSessionMessage({ type: "slide-ui", index: 1, ui: [] }),
    null,
  );
  assert.equal(parsePresentSessionMessage({ type: "hello" }), null);
});

test("build audience and presenter paths", () => {
  const audience = buildPresentationPath({
    presentationId: "abc",
    mode: AUDIENCE_MODE,
    slide: 2,
    search: "embed=true&type=smart",
  });
  assert.equal(
    audience,
    "/presentation?embed=true&type=smart&id=abc&mode=present&slide=2",
  );

  const presenter = buildPresentationPath({
    presentationId: "abc",
    mode: PRESENTER_MODE,
    slide: 2,
    search: "embed=true&type=smart&mode=present",
  });
  assert.equal(presenter.includes("embed="), false);
  assert.equal(presenter.includes("mode=presenter"), true);
  assert.equal(presenter.includes("type=smart"), true);
  assert.equal(presenter.includes("slide=2"), true);

  const editor = buildPresentationPath({
    presentationId: "abc",
    search: "embed=true&mode=present&slide=4",
  });
  assert.equal(editor.includes("mode="), false);
  assert.equal(editor.includes("slide="), false);
  assert.equal(editor.includes("embed=true"), true);
});

test("format elapsed presenter timer", () => {
  assert.equal(formatElapsed(0), "00:00");
  assert.equal(formatElapsed(90_000), "01:30");
  assert.equal(formatElapsed(3_661_000), "1:01:01");
});

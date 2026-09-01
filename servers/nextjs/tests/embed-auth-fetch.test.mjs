import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldAttachEmbedAuth,
} from "../utils/embed.ts";

test("attach embed auth to FastAPI and Next config GETs", () => {
  assert.equal(shouldAttachEmbedAuth("/api/v1/ppt/presentation/x"), true);
  assert.equal(shouldAttachEmbedAuth("/api/v1/auth/status"), true);
  assert.equal(shouldAttachEmbedAuth("/app_data/users/a/image.png"), true);
  assert.equal(shouldAttachEmbedAuth("/api/user-config"), true);
  assert.equal(shouldAttachEmbedAuth("/api/can-change-keys"), true);
  assert.equal(shouldAttachEmbedAuth("/api/runtime-config"), true);
  assert.equal(
    shouldAttachEmbedAuth("http://192.168.7.103:11237/api/user-config"),
    true,
  );
});

test("do not attach embed auth to other Next or third-party URLs", () => {
  assert.equal(shouldAttachEmbedAuth("/api/user-config/save"), false);
  assert.equal(shouldAttachEmbedAuth("/dashboard"), false);
  assert.equal(shouldAttachEmbedAuth("/vendor/fonts/poppins.ttf"), false);
  assert.equal(shouldAttachEmbedAuth("https://api.openai.com/v1/chat"), false);
});

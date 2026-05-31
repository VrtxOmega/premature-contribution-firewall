import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { NEXT_ACTIONS } from "../src/core/queue.mjs";

test("next actor model documents every exported nextAction", async () => {
  const doc = await readFile(new URL("../docs/NEXT_ACTOR_MODEL.md", import.meta.url), "utf8");

  for (const action of Object.values(NEXT_ACTIONS)) {
    assert.ok(doc.includes(`| \`${action.id}\` | \`${action.owner}\` | \`${action.target}\` |`), `missing row for ${action.id}`);
    assert.ok(doc.includes(action.summary), `missing summary for ${action.id}`);
    assert.ok(doc.includes(action.maintainerAction), `missing maintainer action for ${action.id}`);
  }
});

test("next actor model documents precedence and public entry points", async () => {
  const doc = await readFile(new URL("../docs/NEXT_ACTOR_MODEL.md", import.meta.url), "utf8");
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const api = await readFile(new URL("../docs/API.md", import.meta.url), "utf8");

  for (const phrase of [
    "Repository context beats reporter evidence.",
    "Repository routing beats reporter evidence.",
    "Wait states beat reporter evidence.",
    "Maintainer-owned work beats reporter evidence.",
    "Queue explanation drift",
    "Queue actor confusion"
  ]) {
    assert.ok(doc.includes(phrase), `missing next actor model phrase: ${phrase}`);
  }

  assert.match(readme, /docs\/NEXT_ACTOR_MODEL\.md/);
  assert.match(api, /NEXT_ACTOR_MODEL\.md/);
});

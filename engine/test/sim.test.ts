import assert from "node:assert/strict";
import { test } from "node:test";
import { playAiGame, summarize } from "../scripts/simlib.js";

test("100 AI-vs-AI games finish with no illegal states", () => {
  const results = Array.from({ length: 100 }, (_, i) => playAiGame(1000 + i, i % 2 ? ["deepwall", "ember_rush"] : ["ember_rush", "deepwall"]));
  const sum = summarize(results);
  console.log("AI vs AI:", JSON.stringify(sum));
  assert.equal(sum.games, 100);
  assert.ok(results.every((r) => r.winner !== null));
});

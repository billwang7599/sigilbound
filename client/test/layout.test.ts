import assert from "node:assert/strict";
import { test } from "node:test";
import { BOARD_H, BOARD_W, computeLayout } from "../src/core/layout.js";

test("board scales by whole numbers and fits with the HUD", () => {
  for (const [W, H] of [[756, 413], [1280, 800], [1440, 900], [1920, 1080], [2560, 1440], [3840, 2160]] as const) {
    const l = computeLayout(W, H);
    assert.ok(Number.isInteger(l.k), `${W}x${H} k=${l.k}`);
    assert.ok(BOARD_W * l.k <= W && BOARD_H * l.k + l.top + l.hand <= H, `${W}x${H} fits`);
    assert.ok(l.u >= 1 && l.u <= 2);
  }
});

test("laptop and monitor sizes get the big boards", () => {
  assert.deepEqual([computeLayout(1280, 800).k, computeLayout(1280, 800).u], [3, 1]);
  assert.deepEqual([computeLayout(1920, 1080).k, computeLayout(1920, 1080).u], [4, 1.25]);
});

test("tiny windows shrink the board instead of overflowing", () => {
  const l = computeLayout(500, 300);
  assert.ok(l.k < 1 && BOARD_H * l.k + l.top + l.hand <= 300 + 1);
});

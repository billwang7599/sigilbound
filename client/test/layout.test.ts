import assert from "node:assert/strict";
import { test } from "node:test";
import { BOARD_H, BOARD_W, HAND_CARD_H, HAND_CARD_W, computeLayout, handGeometry, liftedCardBox, mulliganScale, placeBox, type Box } from "../src/core/layout.js";

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

test("spare height goes to the hand strip without shrinking the board", () => {
  for (const [W, H] of [[1280, 800], [1440, 900], [1920, 1080], [2560, 1440]] as const) {
    const l = computeLayout(W, H);
    assert.ok(BOARD_H * l.k + l.top + l.hand <= H, `${W}x${H} still fits`);
    assert.ok(l.hand >= Math.round(112 * l.u) && l.hand <= Math.round((HAND_CARD_H + 6) * l.u));
  }
  // 1440×900 has room under a 3× board: the hand shows (nearly) whole cards.
  const l = computeLayout(1440, 900);
  assert.equal(l.k, 3);
  assert.ok(l.hand >= HAND_CARD_H - 4, `hand ${l.hand}`);
  assert.equal(computeLayout(1280, 800).k, 3);
});

test("opening-hand cards get the biggest whole scale that fits", () => {
  assert.equal(mulliganScale(5, 1280, 800, 1), 4);
  assert.equal(mulliganScale(6, 1280, 800, 1), 4);
  assert.equal(mulliganScale(6, 1920, 1080, 1.25), 4);
  assert.equal(mulliganScale(6, 900, 560, 1), 2);
  for (const [W, H, u] of [[1280, 800, 1], [1440, 900, 1], [1920, 1080, 1.25], [756, 413, 1]] as const) {
    for (const n of [5, 6, 7]) {
      const s = mulliganScale(n, W, H, u);
      assert.ok(Number.isInteger(s) && s >= 2 && s <= 5);
      if (s > 2) assert.ok((n * 50 * s + (n - 1) * 8) * u <= W && 70 * s * u <= H);
    }
  }
});

test("small windows trade hand strip for a bigger board", () => {
  const l = computeLayout(900, 560);
  assert.equal(l.k, 2);
  assert.ok(l.hand >= 84 && BOARD_H * 2 + l.top + l.hand <= 560);
});

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));

test("a hand card's preview or menu never sits on the lifted card itself", () => {
  // The big preview (card + keyword panel) and the action menu, unscaled.
  for (const [w, h] of [[500, 360], [220, 260]] as const) {
    for (const [W, H] of [[900, 560], [1280, 800], [1440, 900], [1920, 1080]] as const) {
      const l = computeLayout(W, H);
      const g = handGeometry(l.hand, l.u);
      for (const cx of [W * 0.3, W / 2, W * 0.7]) {
        // The slot's screen rect: its bottom edge is `sink` (scaled) below the screen.
        const slot = { left: cx - (HAND_CARD_W * l.u) / 2, width: HAND_CARD_W * l.u, bottom: H + g.sink * l.u };
        const card = liftedCardBox(slot, g.lift, l.u);
        assert.ok(Math.abs(card.top + card.height - (H - 14 * l.u)) < 1, `${W}x${H} lifted card shows whole`);
        for (const mode of ["card", "side"] as const) {
          const p = placeBox(card, mode, w, h, W, H, 6, l.u);
          const box = { left: p.left, top: p.top, width: w * p.scale, height: h * p.scale };
          assert.ok(box.left >= 8 && box.top >= 8 && box.left + box.width <= W - 8 + 1 && box.top + box.height <= H - 8 + 1, `${W}x${H} on screen`);
          assert.equal(overlap(box, card), 0, `${W}x${H} ${mode} ${w}x${h} at ${cx} covers the card`);
        }
      }
    }
  }
});

test("placement: above when it fits, else beside", () => {
  const card = { left: 500, top: 500, width: 150, height: 210 };
  assert.ok(placeBox(card, "card", 200, 100, 1280, 800, 6, 1).top + 100 <= 500);
  const side = placeBox(card, "card", 300, 600, 1280, 800, 6, 1);
  assert.ok(side.left >= 650 || side.left + 300 <= 500);
});

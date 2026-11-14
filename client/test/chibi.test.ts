import assert from "node:assert/strict";
import { test } from "node:test";
import { installCanvasShim, pixelsOf } from "./tools/canvas-shim.js";

installCanvasShim();
const {
  CHIBI_H, CHIBI_W, DEFAULT_APPEARANCE, PARTS, SLOTS, chibiPortrait, chibiSprite, isAppearance, normalizeAppearance,
  parseAppearance, randomAppearance, serializeAppearance, swatch,
} = await import("../src/gfx/chibi.js");
type Appearance = import("../src/gfx/chibi.js").Appearance;

const opaque = (c: HTMLCanvasElement) => {
  const d = pixelsOf(c);
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++;
  return n;
};

test("every slot has options and the default is valid", () => {
  for (const s of SLOTS) assert.ok(PARTS[s].length >= 2, s);
  assert.ok(PARTS.eyes.length >= 4 && PARTS.hair.length >= 4 && PARTS.mouth.length >= 4);
  assert.ok(PARTS.skin.length >= 4 && PARTS.hairColor.length >= 6 && PARTS.outfit.length >= 4);
  assert.ok(isAppearance(DEFAULT_APPEARANCE));
  for (const s of ["skin", "hairColor", "outfit"] as const) for (const id of PARTS[s]) assert.match(swatch(s, id)!, /^#[0-9a-f]{6}$/);
  assert.equal(swatch("hair", "bob"), null);
});

test("serialize and parse round-trip", () => {
  for (let i = 0; i < 50; i++) {
    const a = randomAppearance(i);
    assert.ok(isAppearance(a));
    assert.deepEqual(parseAppearance(serializeAppearance(a)), a);
  }
  assert.deepEqual(randomAppearance("npc:mira"), randomAppearance("npc:mira"));
});

test("garbage is repaired, never thrown", () => {
  for (const g of [undefined, null, 42, "", "{", "not json", "[]", "{\"hair\":7}", { eyes: "laser" }, []]) {
    assert.deepEqual(parseAppearance(g), { ...DEFAULT_APPEARANCE });
  }
  const partial = normalizeAppearance({ hair: "long", eyes: "nope", extra: 1 });
  assert.equal(partial.hair, "long");
  assert.equal(partial.eyes, DEFAULT_APPEARANCE.eyes);
  assert.ok(!("extra" in partial));
  assert.ok(!isAppearance({ ...DEFAULT_APPEARANCE, mouth: "fangs" }));
});

test("every option and colour renders for every facing and frame", () => {
  const dirs = ["down", "up", "left", "right"] as const;
  for (const s of SLOTS) {
    for (const id of PARTS[s]) {
      const a: Appearance = { ...DEFAULT_APPEARANCE, [s]: id };
      for (const d of dirs) {
        for (const f of [0, 1, 2] as const) {
          const c = chibiSprite(a, d, f);
          assert.equal(c.width, CHIBI_W);
          assert.equal(c.height, CHIBI_H);
          assert.ok(opaque(c) > 150, `${s}=${id} ${d}/${f} drew something`);
        }
      }
      const p = chibiPortrait(a);
      assert.equal(p.width, 48);
      assert.ok(opaque(p) > 900, `${s}=${id} portrait`);
    }
  }
});

test("right is left mirrored, steps differ from standing, sprites are cached", () => {
  const a = randomAppearance(3);
  const L = pixelsOf(chibiSprite(a, "left", 0)), R = pixelsOf(chibiSprite(a, "right", 0));
  // Same silhouette, flipped (shading may differ since the light stays top-left).
  for (let y = 0; y < CHIBI_H; y++) for (let x = 0; x < CHIBI_W; x++) {
    assert.equal(L[(y * CHIBI_W + x) * 4 + 3]! > 0, R[(y * CHIBI_W + (CHIBI_W - 1 - x)) * 4 + 3]! > 0, `${x},${y}`);
  }
  assert.notDeepEqual(pixelsOf(chibiSprite(a, "down", 1)), pixelsOf(chibiSprite(a, "down", 0)));
  assert.notDeepEqual(pixelsOf(chibiSprite(a, "down", 1)), pixelsOf(chibiSprite(a, "down", 2)));
  assert.equal(chibiSprite(a, "up", 2), chibiSprite({ ...a }, "up", 2));
  assert.notEqual(chibiSprite(a, "down", 0, { shadow: true }), chibiSprite(a, "down", 0));
});

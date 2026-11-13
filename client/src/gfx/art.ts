/**
 * Every card's art, in one place. Each entry is a sculpture (see gfx/sculpt.ts) in a 48×48 space, facing right,
 * standing on y≈44. To replace one with a hand-drawn PNG later, add it to `PNG_ART` (id → URL); sprites.ts
 * uses a PNG when one is registered.
 */
import { PAL } from "./palette.js";
import { ell, limb, poly, stroke, type Sculpture } from "./sculpt.js";

/** Optional hand-drawn overrides: card id → image URL (48×48, transparent background). */
export const PNG_ART: Record<string, string> = {};

const sparkle = (x: number, y: number, c: string = PAL.gold4): [number, number, string][] =>
  [[x, y, c], [x - 1, y, c], [x + 1, y, c], [x, y - 1, c], [x, y + 1, c]];

export const MONSTER_ART: Record<string, Sculpture> = {
  cinderpup: {
    shadow: [23, 44, 13],
    prims: [
      limb(14, 33, 7, 22, 6, "flame", 3), ell(6, 19, 3, 4, "flame"),
      limb(16, 36, 15, 43, 3.5, "fire"), limb(20, 37, 21, 43, 3.5, "fire"),
      ell(21, 33, 9, 6, "fire"), ell(22, 36.5, 6, 2.5, "bone"),
      limb(26, 36, 27, 43, 3.5, "fire"), limb(30, 35, 31, 43, 3.5, "fire"),
      ell(31, 26, 7, 6, "fire"),
      poly([25, 23, 26, 13, 31, 20], "fire"), poly([31, 20, 35, 12, 37, 22], "fire"),
      ell(37.5, 28.5, 4, 3, "bone"), ell(41, 27.5, 1.3, 1.2, "ink", { flat: 2, edge: false }),
    ],
    strokes: [stroke([27, 17, 28, 20], PAL.fire4), stroke([34, 16, 34, 19], PAL.fire4)],
    eyes: [{ x: 32.5, y: 23.5, s: 3 }],
  },
  flarekit: {
    shadow: [22, 44, 13],
    prims: [
      limb(13, 31, 5, 22, 4, "fire", 2), ell(4, 19, 3, 4.5, "flame"),
      limb(15, 35, 9, 42, 3, "fire"), limb(19, 36, 15, 43, 3, "fire"),
      ell(22, 33, 10, 5, "fire", { rot: -0.08 }),
      limb(28, 35, 37, 41, 3, "fire"), limb(30, 33, 39, 38, 3, "fire"),
      ell(33, 26, 6, 5, "fire"),
      poly([26, 25, 24, 15, 29, 21, 29, 12, 33, 20, 33, 22], "flame"),
      poly([32, 22, 35, 14, 38, 22], "fire"),
      ell(38.5, 28, 3, 2, "bone"),
    ],
    strokes: [stroke([0, 31, 7, 31], PAL.fire4, false), stroke([1, 36, 8, 36], PAL.fire3, false), stroke([3, 40, 9, 40], PAL.fire4, false)],
    eyes: [{ x: 34.5, y: 24, s: 2.5 }],
  },
  gustling: {
    shadow: [24, 45, 9],
    prims: [
      limb(15, 30, 5, 36, 4, "cloud", 1),
      ell(24, 28, 10, 10, "air"), ell(26.5, 32, 6, 5, "cloud"),
      ell(18.5, 30, 5.5, 3, "cloud", { rot: 0.6 }),
      limb(22, 19, 18, 11, 2.5, "cloud", 1), limb(25.5, 19, 27, 10, 2.5, "cloud", 1),
      poly([33, 25, 39, 28, 33, 30], "gold"),
      limb(22, 38, 22, 41.5, 1.6, "gold"), limb(27, 38, 27, 41.5, 1.6, "gold"),
    ],
    eyes: [{ x: 28.5, y: 23.5, s: 3 }],
    pixels: [...sparkle(40, 14, PAL.gale4)],
  },
  pebblekin: {
    shadow: [24, 44, 14],
    prims: [
      ell(16, 41, 3.5, 2.5, "stone"), ell(31, 41, 3.5, 2.5, "stone"),
      ell(24, 32, 13, 10, "stone"),
      ell(22, 23.5, 9, 3.5, "moss"),
      limb(24, 21, 25, 14, 1.6, "moss"), ell(28, 13, 3, 1.6, "moss", { rot: -0.5 }), ell(21.5, 14.5, 2.5, 1.4, "moss", { rot: 0.5 }),
    ],
    strokes: [stroke([13, 29, 16, 32, 15, 36], PAL.stone1), stroke([30, 37, 33, 35, 35, 36], PAL.stone1), stroke([27, 37, 30, 38], PAL.stone1)],
    eyes: [{ x: 24.5, y: 29, s: 3 }, { x: 31, y: 29, s: 3 }],
  },
  ripplefin: {
    shadow: [24, 44, 12],
    prims: [
      poly([5, 23, 16, 31, 5, 41, 9, 32], "foam"),
      ell(24, 32, 12, 7, "water"),
      poly([17, 27, 23, 18, 30, 26], "foam"),
      ell(26, 35.5, 8, 2.8, "foam"),
      limb(33, 27, 30, 19, 2.5, "foam", 1), limb(35.5, 28, 36, 20, 2.5, "foam", 1),
      ell(23, 38.5, 4, 2, "foam", { rot: 0.4 }),
    ],
    strokes: [stroke([36, 34, 34, 35], PAL.tide0)],
    eyes: [{ x: 30.5, y: 28.5, s: 3 }],
    pixels: [[41, 22, PAL.tide5], [42, 21, PAL.tide4], [43, 16, PAL.tide5], [39, 19, PAL.tide4]],
  },
  emberhorn: {
    shadow: [23, 45, 16],
    prims: [
      limb(14, 36, 14, 44, 4.5, "fire"), limb(19, 37, 19, 44, 4.5, "fire"),
      ell(21, 32, 11, 8, "fire"),
      poly([11, 27, 14, 18, 17, 24, 20, 15, 23, 23, 27, 16, 29, 26], "flame"),
      limb(27, 37, 27, 44, 4.5, "fire"), limb(31, 36, 31, 44, 4.5, "fire"),
      ell(34, 30, 6.5, 6, "fire"), ell(39.5, 32.5, 3.5, 3, "bone"),
      limb(31, 25, 26, 18, 3.5, "bone", 2.5), limb(26, 18, 29, 12, 2.5, "bone", 1),
      limb(36, 25, 39, 18, 3.5, "bone", 2.5), limb(39, 18, 44, 15, 2.5, "bone", 1),
    ],
    strokes: [stroke([12, 44, 16, 44], PAL.ink), stroke([17, 44, 21, 44], PAL.ink), stroke([25, 44, 29, 44], PAL.ink), stroke([29, 44, 33, 44], PAL.ink)],
    eyes: [{ x: 34.5, y: 27.5, s: 2.5 }],
  },
  ash_hound: {
    shadow: [23, 45, 14],
    prims: [
      limb(12, 30, 5, 23, 3.5, "ash", 1.5),
      limb(15, 35, 12, 44, 3.5, "ash"), limb(19, 36, 18, 44, 3.5, "ash"),
      ell(21, 32, 10, 5.5, "ash"),
      limb(28, 35, 29, 44, 3.5, "ash"), limb(32, 34, 33, 44, 3.5, "ash"),
      limb(28, 31, 33, 24, 7, "ash", 5),
      ell(34, 23, 5, 4.5, "ash"), limb(36, 25, 44, 27, 4.5, "ash", 3),
      poly([30, 21, 30, 13, 35, 19], "ash"),
    ],
    strokes: [
      stroke([14, 30, 18, 32, 22, 30, 25, 31], PAL.fire4), stroke([24, 34, 27, 32], PAL.fire3), stroke([30, 28, 32, 26], PAL.fire4),
      stroke([43, 27, 44, 27], PAL.ink),
    ],
    eyes: [{ x: 35.5, y: 22, s: 2, glow: PAL.fire5 }],
    pixels: [[6, 21, PAL.fire4], [8, 18, PAL.fire3]],
  },
  blazerunner: {
    shadow: [24, 45, 13],
    prims: [
      limb(5, 24, 18, 30, 2, "fire", 6), ell(4, 22, 3, 3.5, "flame"),
      limb(18, 34, 15, 44, 4.5, "fire", 3), limb(15, 44, 20, 44, 2, "fire"),
      ell(24, 30, 9, 6, "fire", { rot: -0.3 }), ell(25, 33, 5, 2.2, "bone", { rot: -0.3 }),
      limb(24, 35, 28, 44, 4.5, "fire", 3), limb(27, 44, 32, 44, 2, "fire"),
      limb(28, 27, 33, 20, 5.5, "fire", 4.5),
      ell(36, 18.5, 5, 4, "fire"), limb(37, 21, 45, 21, 3, "fire", 2),
      poly([31, 16, 29, 7, 34, 13, 36, 6, 38, 15], "flame"),
      limb(30, 28, 35, 31, 2, "fire"),
    ],
    eyes: [{ x: 37, y: 16.5, s: 2.5 }],
  },
  skitterwing: {
    shadow: [24, 45, 10],
    prims: [
      ell(17, 18, 9, 3.5, "cloud", { rot: -0.6, edge: false }), ell(13, 24, 8, 3, "cloud", { rot: -0.2, edge: false }),
      limb(18, 33, 14, 42, 1.6, "ash"), limb(24, 34, 24, 43, 1.6, "ash"), limb(30, 33, 34, 42, 1.6, "ash"),
      ell(14, 31, 8, 4, "air", { rot: 0.2 }), ell(24, 31, 5, 4, "air"), ell(32, 29, 5, 5, "air"),
      ell(24, 19, 10, 3.5, "cloud", { rot: -0.95 }),
    ],
    strokes: [
      stroke([11, 28, 10, 33], PAL.gale1), stroke([15, 28, 14, 34], PAL.gale1),
      stroke([34, 25, 38, 17, 41, 16], PAL.gale1, false), stroke([32, 25, 34, 17, 36, 15], PAL.gale1, false),
      stroke([18, 15, 25, 18], PAL.gale4), stroke([22, 13, 26, 17], PAL.gale4),
    ],
    eyes: [{ x: 32.5, y: 26.5, s: 3.5 }],
  },
  mudling: {
    shadow: [24, 45, 13],
    prims: [
      ell(15, 42, 3.5, 2, "bark"), ell(31, 43, 4, 2, "bark"),
      ell(24, 34, 12, 9, "bark"), ell(24, 26, 7, 5, "bark"),
      limb(24, 22, 24, 13, 1.6, "moss"), ell(20, 13, 4, 2, "moss", { rot: 0.4 }), ell(28, 12, 4, 2, "moss", { rot: -0.4 }),
    ],
    strokes: [stroke([23, 37, 28, 37], PAL.wood0), stroke([14, 30, 15, 34], PAL.wood4), stroke([33, 28, 34, 31], PAL.wood1)],
    eyes: [{ x: 21, y: 30, s: 2.5 }, { x: 27, y: 30, s: 2.5 }],
    pixels: [[18, 40, PAL.wood3], [29, 41, PAL.wood3]],
  },
  kindlewing: {
    shadow: [24, 45, 10],
    prims: [
      poly([5, 35, 15, 30, 15, 37], "air"),
      poly([16, 27, 5, 11, 14, 12, 22, 22], "air"), ell(7, 11.5, 3, 3, "flame"),
      ell(24, 30, 9, 7, "air"), ell(26, 33, 6, 4, "cloud"),
      poly([20, 28, 21, 8, 28, 12, 30, 26], "air"), ell(23, 8.5, 3.2, 3.2, "flame"),
      ell(32, 23, 5, 5, "air"), poly([36, 21.5, 42, 24, 36, 26], "gold"),
      limb(22, 37, 21, 43, 1.6, "gold"), limb(27, 37, 27, 43, 1.6, "gold"),
    ],
    strokes: [stroke([22, 14, 26, 24], PAL.gale1), stroke([24, 13, 28, 22], PAL.gale1), stroke([11, 15, 18, 22], PAL.gale1)],
    eyes: [{ x: 32.5, y: 21, s: 2.5 }],
    pixels: [[5, 33, PAL.fire4], [4, 35, PAL.fire3]],
  },
  shellback: {
    shadow: [24, 45, 16],
    prims: [
      ell(13, 40, 3.5, 3, "water"), ell(31, 40, 3.5, 3, "water"),
      limb(32, 33, 40, 30, 6.5, "water", 5.5),
      ell(22, 36, 14, 4.5, "foam"),
      ell(22, 29, 12, 9.5, "water"),
    ],
    strokes: [
      stroke([16, 24, 22, 21, 28, 24, 28, 31, 22, 34, 16, 31, 16, 24], PAL.tide1),
      stroke([22, 21, 22, 13], PAL.tide1), stroke([16, 31, 11, 33], PAL.tide1), stroke([28, 31, 33, 33], PAL.tide1),
      stroke([12, 25, 16, 24], PAL.tide1), stroke([28, 24, 32, 23], PAL.tide1),
    ],
    eyes: [{ x: 38.5, y: 28, s: 2.5 }],
  },
  stormhawk: {
    shadow: [24, 45, 11],
    prims: [
      poly([18, 26, 3, 5, 14, 7, 24, 20], "air"),
      poly([7, 37, 16, 32, 16, 41], "air"),
      ell(24, 30, 8, 9.5, "air", { rot: 0.3 }), ell(27, 32.5, 5, 6, "cloud", { rot: 0.3 }),
      poly([20, 26, 27, 1, 35, 7, 30, 25], "air"),
      ell(32, 21, 5, 5, "air"), poly([36, 19, 43, 21, 41, 24, 37, 25], "gold"),
      limb(22, 38, 21, 44, 2, "gold"), limb(28, 38, 29, 44, 2, "gold"),
    ],
    strokes: [
      stroke([24, 8, 27, 20], PAL.gale1), stroke([28, 6, 29, 18], PAL.gale1), stroke([9, 9, 18, 19], PAL.gale1),
      stroke([42, 2, 38, 9, 42, 10, 38, 17], PAL.gold4, false),
    ],
    eyes: [{ x: 33, y: 19, s: 2.5 }],
  },
  kiln_golem: {
    shadow: [24, 46, 18],
    prims: [
      limb(17, 36, 16, 44, 7, "brick"), limb(31, 36, 32, 44, 7, "brick"),
      limb(10, 21, 6, 35, 7, "brick", 6), limb(38, 21, 42, 35, 7, "brick", 6),
      poly([11, 18, 37, 18, 39, 38, 9, 38], "brick"),
      poly([16, 7, 32, 7, 33, 18, 15, 18], "brick"),
      poly([27, 1, 31, 1, 31, 7, 27, 7], "stone"),
      ell(24, 28, 6.5, 5, "flame", { edge: true }),
    ],
    strokes: [
      stroke([12, 22, 36, 22], PAL.wood1), stroke([10, 34, 17, 34], PAL.wood1), stroke([31, 34, 38, 34], PAL.wood1),
      stroke([20, 18, 20, 22], PAL.wood1), stroke([29, 18, 29, 22], PAL.wood1), stroke([14, 22, 14, 34], PAL.wood1),
      stroke([34, 22, 34, 34], PAL.wood1), stroke([16, 12, 32, 12], PAL.wood1),
    ],
    eyes: [{ x: 19, y: 13, s: 2.5, glow: PAL.fire5 }, { x: 26, y: 13, s: 2.5, glow: PAL.fire5 }],
    pixels: [[30, -0.5, PAL.mauve], [32, -1, PAL.lilac], [24, 30, PAL.white]],
  },
  boulderhorn: {
    shadow: [24, 46, 19],
    prims: [
      limb(11, 36, 11, 44, 6, "stone"), limb(17, 37, 17, 44, 6, "stone"),
      ell(22, 31, 15, 10, "stone"),
      ell(16, 22, 7, 2.2, "moss"), ell(26, 22, 4, 1.6, "moss"),
      limb(27, 37, 27, 44, 6, "stone"), limb(33, 36, 33, 44, 6, "stone"),
      ell(36, 31, 7.5, 7, "stone"),
      poly([40, 28, 47, 15, 44, 31], "bone"), poly([36, 25, 38, 18, 41, 25], "bone"),
    ],
    strokes: [stroke([10, 28, 14, 31, 13, 35], PAL.stone1), stroke([22, 34, 26, 32, 29, 34], PAL.stone1), stroke([19, 26, 22, 28], PAL.stone1)],
    eyes: [{ x: 36.5, y: 28.5, s: 2.5 }],
  },
  undertow_serpent: {
    shadow: [24, 46, 18],
    prims: [
      ell(15, 38, 10, 5, "water"), ell(27, 40, 10, 4.5, "water"),
      limb(30, 38, 32, 17, 7.5, "water", 6),
      poly([27, 32, 21, 23, 27, 25, 23, 16, 29, 19], "foam"),
      limb(34, 36, 34.5, 20, 3, "foam", 2),
      ell(34, 14.5, 6, 5, "water"), limb(36, 18, 44, 19, 4.5, "water", 3),
    ],
    strokes: [stroke([10, 37, 14, 36], PAL.tide4), stroke([22, 39, 26, 38], PAL.tide4), stroke([37, 19, 44, 19], PAL.tide0)],
    eyes: [{ x: 35, y: 12, s: 2.5 }],
    pixels: [[39, 20, PAL.white], [41, 20, PAL.white], [43, 20, PAL.white]],
  },
  deepwater_colossus: {
    shadow: [24, 46, 19],
    prims: [
      limb(18, 34, 16, 45, 7.5, "water"), limb(30, 34, 32, 45, 7.5, "water"),
      limb(12, 19, 8, 36, 7, "water", 8), limb(36, 19, 40, 36, 7, "water", 8),
      ell(24, 25, 12.5, 11, "water"),
      ell(8, 38, 5, 4.5, "water"), ell(40, 38, 5, 4.5, "water"),
      ell(24, 11, 6.5, 5.5, "water"),
      poly([17, 9, 16, 1, 20, 5, 24, 0, 28, 5, 32, 1, 31, 9], "fire"),
      ell(15.5, 24, 2.2, 2.2, "bone"), ell(31, 31, 2.2, 2.2, "bone"), ell(29, 18, 1.6, 1.6, "bone"),
    ],
    strokes: [stroke([21, 22, 24, 28, 27, 22], PAL.tide5), stroke([24, 28, 24, 31], PAL.tide5)],
    eyes: [{ x: 20.5, y: 10, s: 2.5, glow: PAL.tide5 }, { x: 26, y: 10, s: 2.5, glow: PAL.tide5 }],
  },
  elder_treant: {
    shadow: [24, 46, 19],
    prims: [
      limb(16, 38, 9, 45, 4.5, "bark", 2), limb(32, 38, 39, 45, 4.5, "bark", 2), limb(24, 40, 24, 46, 4.5, "bark", 2),
      limb(16, 27, 6, 18, 4.5, "bark", 2.5), limb(32, 27, 42, 17, 4.5, "bark", 2.5),
      poly([16, 19, 32, 19, 34, 42, 14, 42], "bark"),
      ell(10, 16, 6.5, 5, "moss"), ell(39, 14, 6.5, 5, "moss"),
      ell(24, 12, 16, 9, "moss"), ell(24, 6, 9, 5, "moss"),
    ],
    strokes: [
      stroke([19, 24, 19, 40], PAL.wood1), stroke([29, 24, 30, 40], PAL.wood1), stroke([22, 36, 26, 36], PAL.wood0),
      stroke([22, 33, 27, 33], PAL.wood0),
    ],
    eyes: [{ x: 20, y: 26, s: 2.5, glow: PAL.moss4 }, { x: 26, y: 26, s: 2.5, glow: PAL.moss4 }],
    pixels: [[14, 9, PAL.fire4], [32, 6, PAL.fire4], [28, 14, PAL.paper], [9, 13, PAL.paper]],
  },
  abyssal_leviathan: {
    shadow: [24, 46, 21],
    prims: [
      ell(13, 32, 12, 8, "water"),
      poly([7, 26, 1, 12, 14, 23], "foam"), poly([13, 25, 13, 9, 21, 22], "foam"),
      ell(30, 26, 13, 10, "water"),
      poly([19, 32, 46, 29, 40, 41, 22, 39], "water"),
      ell(30, 35, 10, 2.8, "foam"),
      limb(33, 17, 39, 6, 1.8, "water", 1.2), ell(40.5, 5, 2.4, 2.4, "foam"),
    ],
    strokes: [stroke([20, 31, 45, 29], PAL.tide0)],
    eyes: [{ x: 33, y: 21.5, s: 3.5 }],
    pixels: [
      [24, 30, PAL.white], [28, 30, PAL.white], [32, 30, PAL.white], [36, 29, PAL.white], [40, 29, PAL.white], [43, 29, PAL.white],
      [8, 30, PAL.tide5], [14, 28, PAL.tide5], [20, 23, PAL.tide5], [26, 20, PAL.tide5], [11, 35, PAL.tide4], [41, 4, PAL.white],
    ],
  },
};

export const SPELL_ART: Record<string, Sculpture> = {
  spark: {
    prims: [poly([28, 4, 14, 26, 23, 26, 17, 44, 35, 18, 25, 18, 32, 4], "gold")],
    pixels: [...sparkle(9, 12), ...sparkle(39, 32), ...sparkle(36, 8, PAL.white)],
  },
  firebolt: {
    prims: [
      poly([4, 44, 20, 22, 30, 30], "fire"), poly([8, 36, 22, 20, 28, 26], "flame"),
      ell(30, 18, 11, 11, "fire"), ell(30, 18, 7.5, 7.5, "flame"),
    ],
    pixels: [[30, 16, PAL.white], [31, 17, PAL.white], [12, 42, PAL.fire4], [6, 38, PAL.fire3]],
  },
  rally: {
    prims: [
      limb(13, 6, 13, 45, 2.5, "bark"), ell(13, 5, 2.2, 2.2, "gold"),
      poly([14, 8, 42, 11, 35, 18, 42, 26, 14, 28], "fire"),
    ],
    strokes: [stroke([22, 14, 26, 22, 30, 14], PAL.gold3)],
  },
  insight: {
    prims: [
      poly([4, 30, 24, 36, 24, 44, 4, 38], "bone"), poly([44, 30, 24, 36, 24, 44, 44, 38], "bone"),
      ell(24, 18, 13, 7, "cloud"), ell(24, 18, 5, 5, "arcane"),
    ],
    strokes: [stroke([24, 36, 24, 44], PAL.paper4), stroke([8, 34, 18, 37], PAL.paper4), stroke([30, 37, 40, 34], PAL.paper4)],
    pixels: [[22, 16, PAL.white], [23, 16, PAL.white], ...sparkle(6, 8), ...sparkle(42, 10)],
  },
  undermine: {
    prims: [
      ell(24, 38, 20, 6, "stone"),
      limb(12, 8, 30, 32, 3, "bark"), poly([4, 14, 18, 2, 24, 4, 12, 12], "stone"),
    ],
    strokes: [stroke([18, 36, 24, 40, 30, 37, 36, 40], PAL.stone0), stroke([24, 40, 23, 43], PAL.stone0)],
    pixels: [[34, 30, PAL.stone3], [38, 28, PAL.stone2], [30, 28, PAL.stone3]],
  },
  warcry: {
    prims: [poly([6, 34, 30, 14, 38, 10, 40, 22, 14, 40], "bone"), ell(38.5, 16, 3, 6.5, "gold", { rot: 0.3 })],
    strokes: [stroke([20, 24, 26, 32], PAL.gold2), stroke([42, 4, 46, 8], PAL.fire4, false), stroke([44, 14, 47, 15], PAL.fire4, false), stroke([42, 26, 46, 28], PAL.fire4, false)],
  },
  second_wind: {
    prims: [ell(26, 22, 6, 18, "cloud", { rot: 0.6 }), limb(14, 40, 20, 32, 1.6, "bone")],
    strokes: [stroke([17, 36, 34, 9], PAL.gale2), stroke([4, 10, 10, 6, 14, 10], PAL.gale3, false), stroke([36, 40, 42, 36, 46, 40], PAL.gale3, false)],
    pixels: [...sparkle(40, 22, PAL.gale4)],
  },
  rockslide: {
    prims: [ell(14, 14, 8, 7, "stone"), ell(32, 24, 10, 9, "stone"), ell(16, 36, 9, 7, "stone"), ell(36, 40, 5, 4, "stone")],
    strokes: [stroke([30, 20, 34, 26], PAL.stone1), stroke([12, 34, 18, 38], PAL.stone1)],
    pixels: [[6, 26, PAL.stone3], [42, 12, PAL.stone3], [26, 44, PAL.stone2], [4, 44, PAL.stone3]],
  },
  brace: {
    prims: [poly([8, 6, 40, 6, 38, 28, 24, 44, 10, 28], "gold"), poly([12, 10, 36, 10, 34, 27, 24, 39, 14, 27], "water")],
    strokes: [stroke([24, 12, 24, 36], PAL.tide4), stroke([14, 20, 34, 20], PAL.tide4)],
  },
  smoke: {
    prims: [ell(16, 32, 10, 8, "ash"), ell(32, 30, 11, 9, "ash"), ell(24, 18, 11, 9, "ash"), ell(36, 14, 6, 5, "ash")],
    pixels: [[8, 12, PAL.lilac], [42, 40, PAL.lilac], [44, 24, PAL.mauve]],
  },
  snap_trap: {
    prims: [
      ell(24, 38, 18, 4, "stone"),
      poly([6, 36, 10, 20, 24, 14, 38, 20, 42, 36, 36, 26, 24, 22, 12, 26], "stone"),
      ell(24, 36, 4, 3, "gold"),
    ],
    strokes: [stroke([12, 26, 13, 31], PAL.white), stroke([18, 23, 18, 28], PAL.white), stroke([24, 22, 24, 27], PAL.white), stroke([30, 23, 30, 28], PAL.white), stroke([36, 26, 35, 31], PAL.white)],
  },
  riposte: {
    prims: [
      limb(8, 40, 38, 8, 3, "cloud", 2), limb(40, 40, 10, 8, 3, "cloud", 2),
      limb(10, 33, 16, 39, 2.5, "gold"), limb(38, 33, 32, 39, 2.5, "gold"),
      ell(7, 42, 2.4, 2.4, "gold"), ell(41, 42, 2.4, 2.4, "gold"),
    ],
    pixels: [...sparkle(24, 24, PAL.white)],
  },
};

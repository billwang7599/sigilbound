import assert from "node:assert/strict";
import { test } from "node:test";
import { createGame, DECKS, legalActions, viewFor, type DuelUpdate, type GameState, type Monster } from "@sigilbound/engine";
import {
  focusKey, menuArrow, menuItems, moveFocus, normalizeFocus, numberPick, stepMenu, stepSelection, type Field, type Focus,
} from "../src/core/focus.js";
import { plansFor } from "../src/core/intent.js";

const field = (hand: number, spell: boolean[], me: boolean[], opp: boolean[]): Field => ({ hand, rows: { spell, me, opp } });
const none = [false, false, false];

test("number keys: N selects card N, the same N unselects, a different N switches", () => {
  const uids = [10, 11, 12];
  assert.deepEqual(numberPick(3, uids, null), { uid: 12, index: 2, select: true });
  assert.deepEqual(numberPick(3, uids, 12), { uid: 12, index: 2, select: false });
  assert.deepEqual(numberPick(1, uids, 12), { uid: 10, index: 0, select: true });
  assert.equal(numberPick(4, uids, null), null);
});

test("arrows: along the hand with wrap, then up through the occupied rows and back down", () => {
  const f = field(4, [false, true, false], [true, false, true], [false, true, false]);
  let at: Focus | null = null;
  at = moveFocus(at, "right", f);
  assert.deepEqual(at, { area: "hand", index: 0 });
  at = moveFocus(at, "left", f);
  assert.deepEqual(at, { area: "hand", index: 3 });
  at = moveFocus(at, "up", f);
  assert.deepEqual(at, { area: "board", row: "spell", lane: 1 });
  at = moveFocus(at, "up", f);
  assert.equal(at?.area === "board" && at.row, "me");
  at = moveFocus({ area: "board", row: "me", lane: 0 }, "right", f);
  assert.deepEqual(at, { area: "board", row: "me", lane: 2 }, "skips the empty center");
  at = moveFocus(at, "right", f);
  assert.deepEqual(at, { area: "board", row: "me", lane: 0 }, "wraps");
  at = moveFocus(at, "up", f);
  assert.deepEqual(at, { area: "board", row: "opp", lane: 1 });
  assert.deepEqual(moveFocus(at, "up", f), at, "top row: up stays put");
  at = moveFocus(at, "down", f);
  assert.equal(at?.area === "board" && at.row, "me");
  at = moveFocus(at, "down", f);
  assert.equal(at?.area === "board" && at.row, "spell");
  at = moveFocus(at, "down", f);
  assert.equal(at?.area, "hand");
  at = moveFocus(at, "down", f);
  assert.deepEqual(at, { area: "deck" }, "below the hand: the Deck button");
  assert.deepEqual(moveFocus(at, "left", f), at);
  assert.deepEqual(moveFocus(at, "up", f), { area: "hand", index: 0 });
  assert.equal(focusKey({ area: "board", row: "opp", lane: 1 }), "opp:monster:1");
  assert.equal(focusKey({ area: "board", row: "spell", lane: 2 }), "me:spell:2");
});

test("empty rows are skipped; with nothing on the board, up stays on the hand", () => {
  const f = field(2, none, none, [true, false, false]);
  assert.deepEqual(moveFocus({ area: "hand", index: 1 }, "up", f), { area: "board", row: "opp", lane: 0 });
  const bare = field(2, none, none, none);
  assert.deepEqual(moveFocus({ area: "hand", index: 1 }, "up", bare), { area: "hand", index: 1 });
});

test("focus is never stranded: played cards and destroyed monsters move it to what's left", () => {
  assert.deepEqual(normalizeFocus({ area: "hand", index: 4 }, field(3, none, none, none)), { area: "hand", index: 2 });
  // Its monster died: nearest in the row.
  assert.deepEqual(normalizeFocus({ area: "board", row: "opp", lane: 0 }, field(2, none, none, [false, false, true])), { area: "board", row: "opp", lane: 2 });
  // The whole row emptied: down a row, else the hand.
  assert.deepEqual(normalizeFocus({ area: "board", row: "opp", lane: 1 }, field(2, none, [true, false, false], none)), { area: "board", row: "me", lane: 0 });
  assert.deepEqual(normalizeFocus({ area: "board", row: "opp", lane: 1 }, field(2, none, none, none)), { area: "hand", index: 0 });
  // Hand emptied: up onto the board.
  assert.deepEqual(normalizeFocus({ area: "hand", index: 0 }, field(0, none, [false, true, false], none)), { area: "board", row: "me", lane: 1 });
  assert.equal(normalizeFocus({ area: "hand", index: 0 }, field(0, none, none, none)), null);
  // Any arrow with no focus starts somewhere.
  assert.deepEqual(moveFocus(null, "up", field(0, none, none, [false, true, false])), { area: "board", row: "opp", lane: 1 });
});

// ---- the menu, on a real duel ----

function board(): GameState {
  const s = createGame({ seed: 7, decks: [DECKS.ember_rush!, DECKS.deepwall!], first: 0 }).state;
  s.step = "main"; s.turn = 3; s.active = 0;
  for (const pl of s.players) {
    pl.deck.push(...pl.hand); pl.hand = []; pl.mulliganDone = true;
    for (let i = 0; i < 5; i++) { const c = pl.deck.pop()!; pl.sigils.push({ uid: c.uid, id: c.id, tapped: false }); }
  }
  return s;
}
const mon = (uid: number, id: string, position: "atk" | "def" = "atk"): Monster => ({
  uid, id, position, damage: 0, entered: 1, posChanged: false, attacked: false, atkTurn: 0, defTurn: 0, defStone: 0, atkPerm: 0, defPerm: 0,
});
const upd = (s: GameState): DuelUpdate =>
  ({ t: "duel", duelId: "d", token: "t", view: viewFor(s, 0), events: [], legal: legalActions(s, 0), window: null, aiThinking: false });

test("menu: a hand monster lists its legal lanes first, then Bind, Read, Back; arrows walk them", () => {
  const s = board();
  s.players[0].hand.push({ uid: 500, id: "cinderpup" });
  s.players[0].monsters[1] = mon(501, "cinderpup");
  const plans = plansFor({ kind: "hand", uid: 500 }, upd(s));
  const items = menuItems({ verb: "summon", picks: {} }, plans);
  const keys = items.map((i) => i.key);
  assert.deepEqual(keys.filter((k) => k.startsWith("pick:lane:")), ["pick:lane:0", "pick:lane:1", "pick:lane:2"]);
  assert.ok(keys.includes("verb:bind"));
  assert.deepEqual(keys.slice(-2), ["read", "back"]);
  // First arrow lands on the first option; ←/→ stay among the lanes (wrapping); ↓ walks on to the buttons.
  let sel = menuArrow(items, undefined, "right");
  assert.equal(sel, "pick:lane:0");
  sel = menuArrow(items, sel, "left");
  assert.equal(sel, "pick:lane:2", "←/→ wrap among the glowing lanes only");
  sel = menuArrow(items, sel, "down");
  assert.equal(sel, "verb:bind");
  assert.equal(stepMenu(items, "back", 1), "pick:lane:0", "the list wraps");
});

test("menu: attack targets are the only board picks while attacking", () => {
  const s = board();
  // A Leaper facing a monster: two targets (the monster, or over it to the rival).
  s.players[0].monsters[0] = mon(600, "skitterwing");
  s.players[1].monsters[0] = mon(601, "ripplefin");
  const u = upd(s);
  const plans = plansFor({ kind: "monster", lane: 0 }, u);
  const items = menuItems({ verb: "attack", picks: {} }, plans);
  const picks = items.filter((i) => i.t === "pick");
  assert.deepEqual(picks.map((i) => i.key).sort(), ["pick:target:0", "pick:target:direct"]);
  assert.ok(picks.every((i) => i.t === "pick" && i.board && i.dim === "target"));
  // No attack chosen → Esc-able: "back" is always there.
  assert.ok(items.some((i) => i.t === "back"));
});

test("←/→ with a menu open step to the neighbouring hand card, stopping at the ends", () => {
  const hand = [11, 12, 13];
  assert.deepEqual(stepSelection({ kind: "hand", uid: 12 }, "right", hand, [], false), { kind: "hand", uid: 13 });
  assert.deepEqual(stepSelection({ kind: "hand", uid: 12 }, "left", hand, [], false), { kind: "hand", uid: 11 });
  assert.equal(stepSelection({ kind: "hand", uid: 13 }, "right", hand, [], false), null);
  assert.equal(stepSelection({ kind: "hand", uid: 11 }, "left", hand, [], false), null);
  // Choosing a lane on the board keeps the arrows for the menu.
  assert.equal(stepSelection({ kind: "hand", uid: 12 }, "right", hand, [], true), "menu");
});

test("←/→ on a selected monster skip to your next monster that can act", () => {
  const lanes = [true, false, true];
  assert.deepEqual(stepSelection({ kind: "monster", lane: 0 }, "right", [], lanes, false), { kind: "monster", lane: 2 });
  assert.deepEqual(stepSelection({ kind: "monster", lane: 2 }, "left", [], lanes, false), { kind: "monster", lane: 0 });
  assert.equal(stepSelection({ kind: "monster", lane: 2 }, "right", [], lanes, false), null);
  assert.equal(stepSelection({ kind: "monster", lane: 0 }, "left", [], [true, true, false], false), null);
});

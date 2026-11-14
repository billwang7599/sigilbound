import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, createGame, DECKS, legalActions, type GameState, type Monster } from "@sigilbound/engine";
const occ = (s: GameState) => s.players[0].monsters.map((m) => !!m);
import { crestCaption, crestStatus, instantCrest, pickAt, pickLanes, startPick } from "../src/core/crest.js";
import { outsideClick, zoneOf, type OpenLayers } from "../src/core/dismiss.js";
import { moveFocus, normalizeFocus, type Field } from "../src/core/focus.js";

function board(): GameState {
  const s = createGame({ seed: 7, decks: [DECKS.ember_rush!, DECKS.deepwall!], first: 0 }).state;
  s.step = "main"; s.turn = 3; s.active = 0;
  for (const pl of s.players) {
    pl.deck.push(...pl.hand); pl.hand = []; pl.mulliganDone = true;
    for (let i = 0; i < 5; i++) { const c = pl.deck.pop()!; pl.sigils.push({ uid: c.uid, id: c.id, tapped: false }); }
  }
  return s;
}
const mon = (uid: number, id: string): Monster => ({
  uid, id, position: "atk", damage: 0, entered: 1, posChanged: false, attacked: false, atkTurn: 0, defTurn: 0, defStone: 0, atkPerm: 0, defPerm: 0,
});

test("crest status: usable with 2 Sigils and a target; otherwise says why", () => {
  const s = board(); // player 0: Ember
  s.players[0].monsters[1] = mon(900, "cinderpup");
  let st = crestStatus(s, 0, 0, legalActions(s, 0));
  assert.equal(st.crest, "ember");
  assert.equal(st.target, "monster");
  assert.ok(st.usable);
  assert.equal(st.reason, null);

  // No monsters: nothing to use it on.
  const empty = board();
  st = crestStatus(empty, 0, 0, legalActions(empty, 0));
  assert.equal(st.usable, false);
  assert.match(st.reason!, /No monster/);

  // Too few untapped Sigils.
  const poor = board();
  poor.players[0].monsters[1] = mon(900, "cinderpup");
  poor.players[0].sigils.forEach((g, i) => { g.tapped = i > 0; });
  st = crestStatus(poor, 0, 0, legalActions(poor, 0));
  assert.match(st.reason!, /2 untapped Sigils \(you have 1\)/);

  // Used this turn.
  const used = board();
  used.players[0].monsters[1] = mon(900, "cinderpup");
  const after = apply(used, 0, { type: "crest", lane: 1 }).state;
  st = crestStatus(after, 0, 0, legalActions(after, 0));
  assert.ok(st.used);
  assert.equal(st.reason, "Used this turn");

  // Not your turn.
  const theirs = board();
  theirs.active = 1;
  st = crestStatus(theirs, 0, 0, legalActions(theirs, 0));
  assert.equal(st.reason, "Not your turn");

  // The rival's badge: read-only, never "usable", says only whether it's been used.
  st = crestStatus(after, 0, 1, []);
  assert.equal(st.usable, false);
  assert.equal(st.reason, "Used this turn");
});

test("crest pick: Ember/Stone pick a monster; Tide needs none; Gale picks a monster then where it goes", () => {
  const s = board();
  s.players[0].monsters[0] = mon(900, "cinderpup");
  s.players[0].monsters[2] = mon(901, "cinderpup");
  let legal = legalActions(s, 0);
  assert.equal(instantCrest(legal), null);
  const pick = startPick(legal, occ(s))!;
  assert.deepEqual(pick, { from: null });
  assert.deepEqual(pickLanes(legal, pick, occ(s)), [0, 2]);
  assert.deepEqual(pickAt(legal, pick, 2, occ(s)), { act: { type: "crest", lane: 2 } });
  assert.equal(pickAt(legal, pick, 1, occ(s)), null, "a lane that isn't glowing cancels");

  // Tide: no target, used at once.
  s.players[0].crest = "tide";
  legal = legalActions(s, 0);
  assert.equal(startPick(legal, occ(s)), null);
  assert.deepEqual(instantCrest(legal), { type: "crest" });

  // Gale: from, then to.
  s.players[0].crest = "gale";
  s.players[0].monsters[2] = null;
  s.players[0].monsters[1] = mon(902, "cinderpup");
  legal = legalActions(s, 0);
  const g = startPick(legal, occ(s))!;
  assert.deepEqual(g, { from: null });
  assert.deepEqual(pickLanes(legal, g, occ(s)), [0, 1]);
  // Left and Center are both full: Left can only swap (sent at once); Center can swap left or move right.
  assert.deepEqual(pickAt(legal, g, 0, occ(s)), { act: { type: "crest", lane: 0, to: 1 } });
  const next = pickAt(legal, g, 1, occ(s));
  assert.deepEqual(next, { pick: { from: 1 } });
  const to = { from: 1 };
  assert.deepEqual(pickLanes(legal, to, occ(s)), [0, 2]);
  assert.deepEqual(pickAt(legal, to, 2, occ(s)), { act: { type: "crest", lane: 1, to: 2 } });
  assert.deepEqual(pickAt(legal, to, 0, occ(s)), { act: { type: "crest", lane: 0, to: 1 } }, "the swap, picked from its other side");
  s.players[0].monsters[1] = null;
  // A single monster that can move: straight to "where".
  s.players[0].monsters[2] = null;
  legal = legalActions(s, 0);
  assert.deepEqual(startPick(legal, occ(s)), { from: 0 });
});

test("crest captions say who, which Crest and what it did", () => {
  assert.equal(crestCaption("ember", "Rival", 1), "Rival: Ember crest · Center monster +2 ATK");
  assert.equal(crestCaption("tide", "You"), "You: Tide crest · +2 LP");
  assert.equal(crestCaption("gale", "Rival", 0, 1), "Rival: Gale crest · move Left → Center");
});

test("arrow focus: → from the Deck button is the Crest button; ← and ↑ come back", () => {
  const f: Field = { hand: 3, rows: { spell: [false, false, false], me: [false, false, false], opp: [false, false, false] } };
  assert.deepEqual(moveFocus({ area: "deck" }, "right", f), { area: "crest" });
  assert.deepEqual(moveFocus({ area: "crest" }, "left", f), { area: "deck" });
  assert.deepEqual(moveFocus({ area: "crest" }, "up", f), { area: "hand", index: 2 });
  assert.deepEqual(moveFocus({ area: "crest" }, "right", f), { area: "crest" });
  assert.deepEqual(normalizeFocus({ area: "crest" }, f), { area: "crest" });
});

// ---- click outside ----

const open = (o: Partial<OpenLayers>): OpenLayers => ({ menu: false, log: false, crest: false, modal: false, ...o });

test("click outside: a menu closes and the click is swallowed (it doesn't press what's under it)", () => {
  assert.deepEqual(outsideClick(open({ menu: true }), "other"), { close: ["menu"], swallow: true });
  assert.deepEqual(outsideClick(open({ menu: true }), "log"), { close: ["menu"], swallow: true });
  // The Crest button with a card's menu open: first click just closes the menu.
  assert.deepEqual(outsideClick(open({ menu: true }), "crest"), { close: ["menu"], swallow: true });
  // Inside the menu: nothing.
  assert.deepEqual(outsideClick(open({ menu: true }), "menu"), { close: [], swallow: false });
});

test("click outside: hand cards and the board handle themselves, so a drag from a card still works", () => {
  assert.deepEqual(outsideClick(open({ menu: true }), "hand"), { close: [], swallow: false });
  assert.deepEqual(outsideClick(open({ menu: true }), "board"), { close: [], swallow: false });
  assert.deepEqual(outsideClick(open({ crest: true }), "board"), { close: [], swallow: false });
  // The open log isn't modal: it closes, and the card click still counts.
  assert.deepEqual(outsideClick(open({ log: true }), "hand"), { close: ["log"], swallow: false });
});

test("click outside: the log and the Crest pick close the same way; the Crest button toggles its own pick", () => {
  assert.deepEqual(outsideClick(open({ log: true }), "other"), { close: ["log"], swallow: true });
  assert.deepEqual(outsideClick(open({ log: true }), "log"), { close: [], swallow: false });
  assert.deepEqual(outsideClick(open({ crest: true }), "other"), { close: ["crest"], swallow: true });
  assert.deepEqual(outsideClick(open({ crest: true }), "crest"), { close: [], swallow: false });
  assert.deepEqual(outsideClick(open({ menu: true, log: true }), "other"), { close: ["log", "menu"], swallow: true });
});

test("click outside: modals own the click; the Ambush prompt closes panels but still counts", () => {
  assert.deepEqual(outsideClick(open({ menu: true, modal: true }), "other"), { close: [], swallow: false });
  assert.deepEqual(outsideClick(open({ menu: true }), "pass"), { close: ["menu"], swallow: false });
  assert.deepEqual(outsideClick(open({}), "other"), { close: [], swallow: false });
});

test("zoneOf reads the nearest data-zone", () => {
  const el = (z: string | null) => ({ closest: () => (z === null ? null : { getAttribute: () => z }) });
  assert.equal(zoneOf(el("menu")), "menu");
  assert.equal(zoneOf(el("hand")), "hand");
  assert.equal(zoneOf(el("weird")), "other");
  assert.equal(zoneOf(el(null)), "other");
  assert.equal(zoneOf(null), "other");
});

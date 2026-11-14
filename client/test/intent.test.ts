import assert from "node:assert/strict";
import { test } from "node:test";
import {
  apply, createGame, DECKS, legalActions, viewFor, WINDOW_MS, type DuelUpdate, type GameState, type Monster,
} from "@sigilbound/engine";
import {
  dropMarks, groupByVerb, openDims, optionsFor, plansAtDrop, plansFor, primaryVerb, remainingMoves, resolve,
} from "../src/core/intent.js";
import { splitKeywords, KEYWORDS } from "../src/core/keywords.js";

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
function upd(s: GameState): DuelUpdate {
  return { t: "duel", duelId: "d", token: "t", view: viewFor(s, 0), events: [], legal: legalActions(s, 0), window: null, aiThinking: false };
}

test("a monster in hand: the popup asks only lane and position; Bind is a separate button", () => {
  const s = board();
  s.players[0].hand.push({ uid: 500, id: "cinderpup" });
  const u = upd(s);
  const groups = groupByVerb(plansFor({ kind: "hand", uid: 500 }, u));
  assert.deepEqual([...groups.keys()], ["summon", "bind"]);
  assert.equal(primaryVerb(groups, { kind: "hand", uid: 500 }), "summon");
  const summon = groups.get("summon")!;
  assert.deepEqual(openDims(summon), ["lane", "position"]);
  assert.equal(resolve(summon, { lane: "1" }), null);
  const done = resolve(summon, { lane: "1", position: "def" });
  assert.deepEqual(done?.action, { type: "summon", uid: 500, lane: 1, position: "def" });
  assert.equal(openDims(groups.get("bind")!).length, 0);
});

test("dragging: legal slots glow, a drop picks the plans for that slot", () => {
  const s = board();
  s.players[0].hand.push({ uid: 501, id: "emberhorn" });
  s.players[0].monsters[2] = mon(600, "cinderpup");
  const u = upd(s);
  const plans = plansFor({ kind: "hand", uid: 501 }, u);
  const marks = dropMarks(plans, u.view.state, 0);
  assert.equal(marks.get("me:monster:0"), "drop");
  assert.equal(marks.get("me:monster:2"), "replace");
  assert.equal(marks.get("sigils"), "drop");
  assert.ok(!marks.has("opp:monster:0"));
  const hit = plansAtDrop(plans, ["me:monster:1", "field"], 0, u.view.state)!;
  assert.equal(hit.key, "me:monster:1");
  assert.deepEqual(new Set(hit.plans.map((p) => (p.action as { position: string }).position)), new Set(["atk", "def"]));
  assert.equal(plansAtDrop(plans, ["sigils"], 0, u.view.state)!.plans[0]!.action.type, "bind");
  assert.equal(plansAtDrop(plans, ["opp:monster:1", "field"], 0, u.view.state), null);
});

test("a targeted spell asks for its target; Spark can hit either side", () => {
  const s = board();
  s.players[0].hand.push({ uid: 502, id: "spark" });
  s.players[1].monsters[0] = mon(601, "pebblekin", "def"); // DEF 3: not a target
  s.players[1].monsters[2] = mon(602, "gustling");
  s.players[0].monsters[1] = mon(605, "cinderpup"); // yours, DEF 2: also a target
  const u = upd(s);
  const cast = groupByVerb(plansFor({ kind: "hand", uid: 502 }, u)).get("cast")!;
  assert.deepEqual(openDims(cast), ["target"]);
  assert.deepEqual(optionsFor(cast, "target", {}).sort(), ["0:1", "1:2"]);
  assert.equal(plansAtDrop(cast, ["opp:monster:2", "field"], 0, u.view.state)!.plans.length, 1);
});

test("attacking from the Main step goes through the attack step; Leap over a monster prefers the monster", () => {
  const s = board();
  s.players[0].monsters[0] = mon(603, "skitterwing");
  s.players[1].monsters[0] = mon(604, "ripplefin");
  const u = upd(s);
  const plans = plansFor({ kind: "monster", lane: 0 }, u).filter((p) => p.action.type === "attack");
  assert.equal(plans.length, 2);
  assert.ok(plans.every((p) => p.viaAttackStep));
  const onMonster = plansAtDrop(plans, ["opp:monster:0", "field"], 0, u.view.state)!;
  assert.deepEqual(onMonster.plans.map((p) => p.action), [{ type: "attack", lane: 0, target: { kind: "monster", lane: 0 } }]);
  const face = plansAtDrop(plans, ["face"], 0, u.view.state)!;
  assert.deepEqual(face.plans[0]!.action, { type: "attack", lane: 0, target: { kind: "direct" } });
  // In the attack step the real attacks are listed and nothing is "via".
  const t = apply(s, 0, { type: "attackStep" }).state;
  for (const sg of t.players[1].sigils) sg.tapped = true;
  assert.ok(plansFor({ kind: "monster", lane: 0 }, upd(t)).every((p) => !p.viaAttackStep));
  assert.ok(remainingMoves(upd(t)) >= 1);
  void WINDOW_MS;
});

test("keywords: one glossary, and card text is split into tooltip runs", () => {
  const parts = splitKeywords("Awaken 5: +2/+2. On play: the monster across gets -2 DEF. Guard");
  const kws = parts.filter((p) => p.kw).map((p) => p.kw);
  assert.deepEqual(kws, ["awaken", "onPlay", "across", "def", "guard"]);
  assert.equal(parts.map((p) => p.text).join(""), "Awaken 5: +2/+2. On play: the monster across gets -2 DEF. Guard");
  for (const k of ["guard", "leap", "rush", "awaken", "quick", "prepared", "ambush", "trample", "sturdy", "swift"]) assert.ok(KEYWORDS[k]?.text);
});

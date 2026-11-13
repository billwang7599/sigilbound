import assert from "node:assert/strict";
import { test } from "node:test";
import {
  apply, atkOf, attackTargets, createGame, DECKS, defOf, eventsFor, IllegalActionError, legalActions, viewFor,
} from "../src/index.js";
import { blank, give, put, run, setSigils, toAttack } from "./helpers.js";

test("attack vs attack: the lower ATK is destroyed and its owner loses the difference", () => {
  const s = blank();
  put(s, 0, 0, "emberhorn"); // 4
  put(s, 1, 0, "cinderpup"); // 3
  const r = run(toAttack(s), [0, { type: "attack", lane: 0, target: { kind: "monster", lane: 0 } }]);
  assert.equal(r.state.players[1].monsters[0], null);
  assert.ok(r.state.players[0].monsters[0]);
  assert.equal(r.state.players[1].lp, 19);
  assert.equal(r.state.players[0].lp, 20);
});

test("attack vs attack: a weaker attacker dies and its owner takes the difference", () => {
  const s = blank();
  put(s, 0, 0, "cinderpup"); // 3
  put(s, 1, 0, "stormhawk"); // 5
  const r = run(toAttack(s), [0, { type: "attack", lane: 0, target: { kind: "monster", lane: 0 } }]);
  assert.equal(r.state.players[0].monsters[0], null);
  assert.equal(r.state.players[0].lp, 18);
  assert.equal(r.state.players[1].lp, 20);
});

test("attack vs attack: a tie destroys both and nobody loses LP", () => {
  const s = blank();
  put(s, 0, 0, "cinderpup");
  put(s, 1, 0, "ash_hound");
  const r = run(toAttack(s), [0, { type: "attack", lane: 0, target: { kind: "monster", lane: 0 } }]);
  assert.equal(r.state.players[0].monsters[0], null);
  assert.equal(r.state.players[1].monsters[0], null);
  assert.equal(r.state.players[0].lp + r.state.players[1].lp, 40);
});

test("an empty slot across means a direct hit", () => {
  const s = blank();
  put(s, 0, 1, "emberhorn");
  assert.deepEqual(attackTargets(s, 0, 1), [{ kind: "direct" }]);
  const r = run(toAttack(s), [0, { type: "attack", lane: 1, target: { kind: "direct" } }]);
  assert.equal(r.state.players[1].lp, 16);
});

test("defense damage stacks through the turn, a center Guard pulls all 3 lanes, and there's no recoil", () => {
  const s = blank();
  put(s, 0, 0, "cinderpup"); // 3
  put(s, 0, 1, "ash_hound"); // 3
  put(s, 0, 2, "gustling"); // 2, Leap: still pulled
  put(s, 1, 1, "boulderhorn", "def"); // 1/8 Guard
  let st = toAttack(s);
  for (const lane of [0, 1, 2]) assert.deepEqual(attackTargets(st, 0, lane), [{ kind: "monster", lane: 1 }]);
  st = run(st,
    [0, { type: "attack", lane: 0, target: { kind: "monster", lane: 1 } }],
    [0, { type: "attack", lane: 1, target: { kind: "monster", lane: 1 } }]).state;
  assert.equal(st.players[1].monsters[1]!.damage, 6);
  st = run(st, [0, { type: "attack", lane: 2, target: { kind: "monster", lane: 1 } }]).state;
  assert.equal(st.players[1].monsters[1], null, "3 + 3 + 2 = 8 reaches DEF 8");
  assert.equal(st.players[0].lp, 20);
  assert.equal(st.players[1].lp, 20);
});

test("damage on a defender clears at the end of the turn", () => {
  const s = blank();
  put(s, 0, 1, "cinderpup");
  put(s, 1, 1, "shellback", "def"); // 2/7
  let st = run(toAttack(s), [0, { type: "attack", lane: 1, target: { kind: "monster", lane: 1 } }]).state;
  assert.equal(st.players[1].monsters[1]!.damage, 3);
  st = run(st, [0, { type: "endTurn" }]).state;
  assert.equal(st.players[1].monsters[1]!.damage, 0);
});

test("Guard works only in defense position and an edge Guard pulls only 2 lanes", () => {
  const s = blank();
  put(s, 0, 0, "cinderpup");
  put(s, 0, 2, "emberhorn");
  put(s, 1, 1, "pebblekin", "atk");
  assert.deepEqual(attackTargets(s, 0, 0), [{ kind: "direct" }], "a Guard in attack position pulls nothing");
  s.players[1].monsters[1] = null;
  put(s, 1, 0, "pebblekin", "def");
  assert.deepEqual(attackTargets(s, 0, 0), [{ kind: "monster", lane: 0 }]);
  assert.deepEqual(attackTargets(s, 0, 2), [{ kind: "direct" }], "lane 2 isn't adjacent to lane 0");
});

test("Leap may hit directly over a monster, but not in Deep Lake or past a Guard", () => {
  const s = blank();
  put(s, 0, 0, "skitterwing");
  put(s, 1, 0, "shellback", "def");
  assert.deepEqual(attackTargets(s, 0, 0), [{ kind: "monster", lane: 0 }, { kind: "direct" }]);
  s.fields[0] = "deep_lake";
  assert.deepEqual(attackTargets(s, 0, 0), [{ kind: "monster", lane: 0 }]);
  s.fields[0] = "crossroads";
  put(s, 1, 1, "pebblekin", "def");
  assert.deepEqual(attackTargets(s, 0, 0), [{ kind: "monster", lane: 1 }]);
});

test("rest draw: no bind means one extra card at the end of the turn", () => {
  const s = blank();
  const before = s.players[0].hand.length;
  const noBind = run(s, [0, { type: "endTurn" }]).state;
  assert.equal(noBind.players[0].hand.length, before + 1);

  const s2 = blank();
  const u = give(s2, 0, "cinderpup");
  const bound = run(s2, [0, { type: "bind", uid: u }], [0, { type: "endTurn" }]).state;
  assert.equal(bound.players[0].hand.length, 0);
});

test("Rush: +2 ATK while you have 3 or fewer Sigils, off the moment you bind a 4th", () => {
  const s = blank();
  setSigils(s, 0, 3);
  put(s, 0, 0, "flarekit"); // 1/2 Rush
  assert.equal(atkOf(s, 0, 0), 3);
  const u = give(s, 0, "spark");
  const st = run(s, [0, { type: "bind", uid: u }]).state;
  assert.equal(st.players[0].sigils.length, 4);
  assert.equal(atkOf(st, 0, 0), 1);
});

test("Awaken counts total Sigils (tapped too) when played from hand; Second Wind revives don't Awaken", () => {
  const s = blank();
  setSigils(s, 0, 4);
  s.players[0].sigils[3]!.tapped = true; // 3 untapped, 4 total
  const u = give(s, 0, "kindlewing"); // 3/4, Awaken 4: +2/+2
  const st = run(s, [0, { type: "summon", uid: u, lane: 0, position: "atk" }]).state;
  assert.equal(atkOf(st, 0, 0), 5);
  assert.equal(defOf(st, 0, 0), 6);

  const s2 = blank();
  setSigils(s2, 0, 3);
  const u2 = give(s2, 0, "kindlewing");
  const st2 = run(s2, [0, { type: "summon", uid: u2, lane: 0, position: "atk" }]).state;
  assert.equal(atkOf(st2, 0, 0), 3);

  const s3 = blank();
  setSigils(s3, 0, 6);
  s3.players[0].deck.pop();
  s3.players[0].discard.push({ uid: 4242, id: "kindlewing" });
  s3.players[0].deck.pop();
  s3.players[0].spells[1] = { uid: 4243, id: "second_wind", setTurn: 1 };
  const st3 = run(s3, [0, { type: "flip", lane: 1, uid: 4242, position: "atk" }]).state;
  assert.equal(st3.players[0].monsters[1]!.id, "kindlewing");
  assert.equal(atkOf(st3, 0, 1), 3, "no Awaken bonus on a revive");
});

test("Replace sends the old monster to the discard pile without a 'when destroyed' trigger", () => {
  const s = blank();
  put(s, 0, 0, "kiln_golem");
  const u = give(s, 0, "cinderpup");
  const r = run(s, [0, { type: "summon", uid: u, lane: 0, position: "atk" }]);
  assert.equal(r.state.players[0].monsters[0]!.id, "cinderpup");
  assert.ok(r.state.players[0].discard.some((c) => c.id === "kiln_golem"));
  assert.equal(r.state.players[1].lp, 20, "a replaced Kiln Golem does nothing");
});

test("Kiln Golem destroyed in battle costs its owner's opponent 2 LP", () => {
  const s = blank();
  put(s, 0, 0, "kiln_golem"); // 5
  put(s, 1, 0, "undertow_serpent"); // 5: tie
  const r = run(toAttack(s), [0, { type: "attack", lane: 0, target: { kind: "monster", lane: 0 } }]);
  assert.equal(r.state.players[1].lp, 18);
});

test("an Ambush window opens on public facts only, and Snap Trap cancels the attack", () => {
  const s = blank();
  put(s, 0, 1, "emberhorn"); // 4 ATK
  let st = apply(s, 0, { type: "attackStep" }).state;
  // The defender has untapped Sigils but no Ambush in hand: the window still opens, so it can't leak the hand.
  const open = run(st, [0, { type: "attack", lane: 1, target: { kind: "direct" } }]).state;
  assert.equal(open.window?.kind, "attack");
  assert.deepEqual(legalActions(open, 1), [{ type: "pass" }]);
  assert.equal(run(open, [1, { type: "pass" }]).state.players[1].lp, 16);

  const trap = give(s, 1, "snap_trap");
  st = apply(s, 0, { type: "attackStep" }).state;
  const r = run(st, [0, { type: "attack", lane: 1, target: { kind: "direct" } }], [1, { type: "ambush", uid: trap }]);
  assert.equal(r.state.players[0].monsters[1], null);
  assert.equal(r.state.players[1].lp, 20);
  assert.equal(r.state.window, null);
});

test("no window when the defender can't pay for any Ambush", () => {
  const s = blank();
  put(s, 0, 1, "emberhorn");
  const st = run(toAttack(s), [0, { type: "attack", lane: 1, target: { kind: "direct" } }]).state;
  assert.equal(st.window, null);
  assert.equal(st.players[1].lp, 16);
});

test("drawing from an empty deck costs 2 LP", () => {
  const s = blank();
  s.players[1].discard.push(...s.players[1].deck);
  s.players[1].deck = [];
  const st = run(s, [0, { type: "endTurn" }]).state; // player 1 starts and draws
  assert.equal(st.players[1].lp, 18);
});

test("the first player can't attack on turn 1, and illegal actions are rejected", () => {
  let s = createGame({ seed: 3, decks: [DECKS.ember_rush!, DECKS.deepwall!], first: 0 }).state;
  s = run(s, [0, { type: "mulligan", uids: [] }], [1, { type: "mulligan", uids: [] }]).state;
  assert.equal(s.turn, 1);
  assert.equal(s.players[0].hand.length, 6);
  assert.equal(s.players[1].hand.length, 6, "the second player's extra card");
  assert.ok(!legalActions(s, 0).some((a) => a.type === "attackStep"));
  assert.throws(() => apply(s, 0, { type: "attackStep" }), IllegalActionError);
  assert.throws(() => apply(s, 1, { type: "endTurn" }), IllegalActionError);
});

test("viewFor hides the opponent's hand, Sigils, set spells, every deck and the RNG seed", () => {
  const s = blank();
  give(s, 0, "spark");
  give(s, 1, "snap_trap");
  s.players[1].spells[2] = { uid: 999, id: "rockslide", setTurn: 2 };
  const v = viewFor(s, 0);
  assert.equal(v.state.rng, 0);
  assert.equal(v.state.players[0].hand[0]!.id, "spark");
  assert.ok(v.state.players[1].hand.every((c) => c.id === "hidden" && c.uid < 0));
  assert.ok(v.state.players[1].sigils.every((c) => c.id === "hidden"));
  assert.ok(v.state.players[0].sigils.every((c) => c.id !== "hidden"), "your own Sigils are yours to see");
  assert.equal(v.state.players[1].spells[2]!.id, "hidden");
  assert.ok(v.state.players.every((pl) => pl.deck.every((c) => c.id === "hidden")));
  assert.equal(v.state.players[1].deck.length, s.players[1].deck.length);
  assert.ok(!JSON.stringify(v).includes("snap_trap") && !JSON.stringify(v).includes("rockslide"));

  const ev = eventsFor([{ t: "draw", p: 1, card: "snap_trap", uid: 5 }, { t: "draw", p: 0, card: "spark", uid: 6 }], 0);
  assert.deepEqual(ev, [{ t: "draw", p: 1 }, { t: "draw", p: 0, card: "spark", uid: 6 }]);
});

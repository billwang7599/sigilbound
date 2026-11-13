import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, attackTargets, chooseAction, createGame, DECKS, legalActions, viewFor } from "../src/index.js";
import { runMatchup, summarize } from "../scripts/simlib.js";
import { blank, give, put, setSigils } from "./helpers.js";

test("AI sets Rockslide across an enemy monster, not in an empty lane", () => {
  const s = blank();
  s.active = 1;
  s.players[1].bound = true; // binding isn't on the table, so the choice is about the spell
  setSigils(s, 1, 3);
  put(s, 0, 2, "kiln_golem");
  const uid = give(s, 1, "rockslide");
  const a = chooseAction(viewFor(s, 1));
  assert.deepEqual(a, { type: "set", uid, lane: 2 });
});

test("AI flips a set Rockslide on a later turn to destroy the monster across", () => {
  const s = blank();
  s.active = 1;
  s.players[1].bound = true;
  put(s, 0, 1, "stormhawk");
  s.players[1].spells[1] = { uid: 4242, id: "rockslide", setTurn: 2 };
  const a = chooseAction(viewFor(s, 1));
  assert.deepEqual(a, { type: "flip", lane: 1 });
});

test("AI goes to its attack step when a hit is free, instead of ending the turn", () => {
  // From a traced game: the old AI ended the turn here, because only "end turn" counted next turn's threat from
  // the two monsters that just entered.
  const s = blank();
  s.players[0].bound = true;
  setSigils(s, 0, 3);
  for (const sg of s.players[0].sigils) sg.tapped = true;
  put(s, 0, 0, "blazerunner", "atk", { entered: 3 });
  put(s, 0, 1, "gustling"); // Leap: can hit directly over the monster across
  put(s, 0, 2, "flarekit", "atk", { entered: 3 });
  put(s, 1, 0, "ash_hound");
  put(s, 1, 1, "flarekit");
  const a = chooseAction(viewFor(s, 0));
  assert.equal(a.type, "attackStep");
});

test("AI answers Ambush windows: Smoke on a direct hit", () => {
  const s = blank();
  put(s, 0, 0, "stormhawk");
  const smoke = give(s, 1, "smoke");
  const w = apply(s, 0, { type: "attackStep" }).state;
  const r = apply(w, 0, { type: "attack", lane: 0, target: { kind: "direct" } }).state;
  assert.equal(r.window?.responder, 1);
  assert.deepEqual(chooseAction(viewFor(r, 1)), { type: "ambush", uid: smoke });
});

test("AI walls go into defense position when nothing is across yet", () => {
  const s = blank();
  s.players[0].bound = true;
  setSigils(s, 0, 1);
  s.turn = 1; // no attack step, so the summon is the only real choice
  const uid = give(s, 0, "ripplefin");
  const a = chooseAction(viewFor(s, 0));
  assert.equal(a.type, "summon");
  assert.equal(a.type === "summon" && a.uid === uid && a.position, "def");
});

test("both decks' AIs use Quick, Prepared and Ambush spells in sims", () => {
  const res = runMatchup(["ember_rush", "deepwall"], 60, 5000);
  const sum = summarize(res);
  const e = sum.spellsPerGame.ember_rush!, d = sum.spellsPerGame.deepwall!;
  assert.ok(e.quick >= 0.8, `Ember quick ${e.quick}`);
  assert.ok(e.set >= 0.5, `Ember set ${e.set}`);
  assert.ok(d.quick >= 0.8, `Deepwall quick ${d.quick}`);
  assert.ok(d.set >= 0.7, `Deepwall set ${d.set}`);
  assert.ok(d.flip >= 0.4, `Deepwall flip ${d.flip}`);
  assert.ok(d.ambush >= 0.6, `Deepwall ambush ${d.ambush}`);
  const silent = res.filter((r) => {
    const i = r.decks.indexOf("deepwall");
    const c = r.spells[i]!;
    return c.quick + c.set + c.ambush === 0;
  }).length;
  assert.ok(silent <= 6, `${silent}/60 Deepwall games with no spells`);
});

test("lane count is a setup option: default 3, and a 4-lane duel plays out with Guard pulling adjacent lanes", () => {
  const d3 = createGame({ seed: 1, decks: [DECKS.ember_rush!, DECKS.deepwall!] }).state;
  assert.equal(d3.players[0].monsters.length, 3);
  assert.equal(d3.fields.length, 3);
  const s = createGame({ seed: 1, decks: [DECKS.ember_rush!, DECKS.deepwall!], lanes: 4 }).state;
  assert.equal(s.players[0].monsters.length, 4);
  assert.equal(s.players[1].spells.length, 4);
  assert.equal(s.fields.length, 4);
  assert.throws(() => createGame({ seed: 1, decks: [DECKS.ember_rush!, DECKS.deepwall!], lanes: 0 }));

  const b = blank();
  for (const pl of b.players) { pl.monsters.push(null); pl.spells.push(null); }
  b.fields.push(null);
  put(b, 1, 2, "pebblekin", "def");
  put(b, 0, 3, "emberhorn");
  put(b, 0, 0, "cinderpup");
  assert.deepEqual(attackTargets(b, 0, 3), [{ kind: "monster", lane: 2 }], "lane 3 is pulled by a Guard in lane 2");
  assert.deepEqual(attackTargets(b, 0, 0), [{ kind: "direct" }], "lane 0 is out of its reach");
  const give4 = give(b, 0, "emberhorn");
  assert.ok(legalActions(b, 0).some((a) => a.type === "summon" && a.uid === give4 && a.lane === 3));

  const r = runMatchup(["ember_rush", "deepwall"], 6, 9000, { lanes: 4 });
  assert.ok(r.every((x) => x.winner !== null));
});

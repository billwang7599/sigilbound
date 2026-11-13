import assert from "node:assert/strict";
import { test } from "node:test";
import { createGame, DECKS, eventsFor, type GameEvent, type GameState, type Monster } from "@sigilbound/engine";
import { keywordsOf } from "../src/core/keywords.js";
import { playCaption, playCard, playDestination, playsIn, playTargets } from "../src/core/plays.js";

function state(): GameState {
  const s = createGame({ seed: 3, decks: [DECKS.ember_rush!, DECKS.deepwall!], first: 0 }).state;
  s.step = "main"; s.turn = 4; s.active = 1;
  return s;
}
const mon = (uid: number, id: string): Monster => ({
  uid, id, position: "atk", damage: 0, entered: 1, posChanged: false, attacked: false, atkTurn: 0, defTurn: 0, defStone: 0, atkPerm: 0, defPerm: 0,
});

test("plays are split from their effects: a spell owns the destroys and LP changes that follow it", () => {
  const events: GameEvent[] = [
    { t: "turn", p: 1, turn: 4 },
    { t: "draw", p: 1 },
    { t: "bind", p: 1 },
    { t: "cast", p: 1, card: "spark", target: { side: 0, lane: 1 } },
    { t: "destroyed", p: 0, lane: 1, card: "emberhorn", cause: "effect" },
    { t: "summon", p: 1, card: "pebblekin", lane: 2, position: "def", awakened: false },
    { t: "attackStep", p: 1 },
    { t: "lp", p: 0, delta: -3, lp: 17, reason: "attack" },
  ];
  const plays = playsIn(events);
  assert.deepEqual(plays.map((p) => p.event.t), ["bind", "cast", "summon"]);
  assert.equal(plays[1]!.effects.length, 1, "the destroy belongs to the cast");
  assert.equal(plays[2]!.effects.length, 0, "the attack step ends the summon's effects; the LP loss isn't the summon's");
});

test("a reveal aims at the cast's target and every place its effects touched, from the viewer's side", () => {
  const s = state();
  const [, cast] = playsIn([
    { t: "bind", p: 1 },
    { t: "cast", p: 1, card: "spark", target: { side: 0, lane: 1 } },
    { t: "destroyed", p: 0, lane: 1, card: "emberhorn", cause: "effect" },
    { t: "lp", p: 1, delta: 2, lp: 22, reason: "Tide" },
  ]);
  assert.deepEqual(playTargets(cast!, 0), ["me:monster:1", "lp:opp"]);
  assert.deepEqual(playTargets(cast!, 1), ["opp:monster:1", "lp:me"]);
  assert.equal(playCaption(cast!, s, 0), "Rival casts Spark → Emberhorn destroyed, rival gains 2 LP");
  assert.equal(playDestination(cast!.event, 0), "discard:opp");
});

test("a summon lands in its slot (not a target), and its on-play effect is in the caption", () => {
  const s = state();
  s.players[0].monsters[0] = mon(77, "pebblekin");
  const [play] = playsIn([
    { t: "summon", p: 1, card: "ash_hound", lane: 0, position: "atk", awakened: false },
    { t: "buff", p: 0, lane: 0, atk: 0, def: -2 },
  ]);
  assert.deepEqual(playTargets(play!, 0), ["me:monster:0"]);
  assert.equal(playDestination(play!.event, 0), "opp:monster:0");
  assert.equal(playCaption(play!, s, 0), "Rival summons Ash Hound (Left, attack) → Pebblekin -2 DEF");
});

test("the rival's binds and face-down sets stay hidden in reveals and captions", () => {
  const s = state();
  const raw: GameEvent[] = [{ t: "bind", p: 1, card: "rockslide" }, { t: "set", p: 1, lane: 2, card: "rockslide" }];
  const seen = eventsFor(raw, 0);
  const plays = playsIn(seen);
  assert.deepEqual(plays.map((p) => playCard(p.event)), ["hidden", "hidden"]);
  const captions = plays.map((p) => playCaption(p, s, 0));
  assert.deepEqual(captions, ["Rival binds a Sigil", "Rival sets a spell face down (Right)"]);
  assert.ok(!JSON.stringify(captions).toLowerCase().includes("rockslide"));
  assert.equal(playDestination(plays[0]!.event, 0), "sigils:opp");
  assert.equal(playDestination(plays[1]!.event, 0), "opp:spell:2");
});

test("keywordsOf lists a card's rules words once each, spell kind first", () => {
  assert.deepEqual(keywordsOf("pebblekin"), ["guard"]);
  assert.deepEqual(keywordsOf("ash_hound"), ["onPlay", "across"]);
  assert.equal(keywordsOf("spark")[0], "quick");
  assert.deepEqual(keywordsOf("hidden"), []);
});

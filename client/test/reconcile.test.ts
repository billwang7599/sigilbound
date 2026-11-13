import assert from "node:assert/strict";
import { test } from "node:test";
import {
  actors, apply, chooseAction, createGame, DECKS, legalActions, viewFor, type GameState, type PlayerId,
} from "@sigilbound/engine";
import { applyOps, diff, emptyShown, wanted, type Shown } from "../src/core/reconcile.js";

/** Plays a few AI-vs-AI games and yields each player-0 view along the way. */
function* views(games: number): Generator<GameState> {
  for (let g = 0; g < games; g++) {
    let s = createGame({ seed: 100 + g, decks: [DECKS.ember_rush!, DECKS.deepwall!] }).state;
    for (let i = 0; i < 400 && s.step !== "over"; i++) {
      const p = actors(s)[0] as PlayerId;
      s = apply(s, p, chooseAction(viewFor(s, p))).state;
      yield viewFor(s, 0).state;
    }
  }
}

test("the board reconciles to every state, whatever it showed before", () => {
  let shown: Shown = emptyShown();
  const history: Shown[] = [];
  let n = 0;
  for (const s of views(6)) {
    const want = wanted(s, 0);
    shown = applyOps(shown, diff(shown, want));
    assert.deepEqual(shown, want);
    // From a stale picture (animations skipped, updates dropped), one pass still lands on the truth.
    const stale = history[Math.max(0, history.length - 1 - (n % 7))] ?? emptyShown();
    assert.deepEqual(applyOps(stale, diff(stale, want)), want);
    // And once it matches, there's nothing left to do.
    assert.deepEqual(diff(want, want), []);
    history.push(want);
    n++;
  }
  assert.ok(n > 100);
});

test("every monster and set spell in the state is on the board, on both sides", () => {
  let seenMine = 0, seenTheirs = 0, seenHiddenSpell = 0;
  for (const s of views(4)) {
    const shown = applyOps(emptyShown(), diff(emptyShown(), wanted(s, 0)));
    for (const [p, side] of [[0, "me"], [1, "opp"]] as const) {
      s.players[p].monsters.forEach((m, lane) => {
        if (!m) return;
        assert.equal(shown.monsters[`${side}:${lane}`]?.uid, m.uid);
        if (side === "me") seenMine++; else seenTheirs++;
      });
      s.players[p].spells.forEach((sp, lane) => {
        if (!sp) return;
        assert.ok(shown.spells[`${side}:${lane}`]);
        if (sp.id === "hidden") seenHiddenSpell++;
      });
      assert.equal(shown.sigils[side].length, s.players[p].sigils.length);
    }
  }
  assert.ok(seenMine && seenTheirs && seenHiddenSpell);
});

test("a hidden set spell keeps its place across views (its uid is renumbered per view)", () => {
  const s = createGame({ seed: 5, decks: [DECKS.ember_rush!, DECKS.deepwall!], first: 0 }).state;
  s.players[1].spells[1] = { uid: 77, id: "rockslide", setTurn: 2 };
  const a = wanted(viewFor(s, 0).state, 0);
  s.players[1].hand.push({ uid: 999, id: "spark" }); // shifts the hidden uids
  const b = wanted(viewFor(s, 0).state, 0);
  assert.deepEqual(diff(a, b).filter((o) => o.op.includes("Spell")), []);
  void legalActions;
});

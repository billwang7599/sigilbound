import assert from "node:assert/strict";
import { test } from "node:test";
import { WINDOW_MS, type DuelUpdate, type ServerMessage } from "@sigilbound/engine";
import { AI_DELAY, AI_DELAY_HURRIED, Duels } from "../src/core/duels.js";
import type { Clock } from "../src/core/ports.js";
import { MemoryDuelStore } from "../src/db/memory.js";
import { clientMessageSchema } from "../src/ws/schema.js";

/** A clock tests advance by hand. */
class FakeClock implements Clock {
  t = 0;
  private timers: { at: number; fn: () => void; live: boolean }[] = [];
  now() { return this.t; }
  after(ms: number, fn: () => void) {
    const timer = { at: this.t + ms, fn, live: true };
    this.timers.push(timer);
    return () => { timer.live = false; };
  }
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      const next = this.timers.filter((x) => x.live && x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      next.live = false;
      this.t = next.at;
      next.fn();
    }
    this.t = end;
  }
}

function setup() {
  const clock = new FakeClock();
  const sent: ServerMessage[] = [];
  let n = 0;
  const duels = new Duels({
    store: new MemoryDuelStore(), clock, link: { send: (_id, m) => sent.push(m) },
    ids: { duelId: () => `d${++n}`, token: () => "secret", seed: () => 12345 },
  });
  const last = () => sent.filter((m): m is DuelUpdate => m.t === "duel").at(-1)!;
  return { clock, duels, sent, last };
}

test("a duel against the AI: mulligans, then the AI plays its turns on its own", () => {
  const { clock, duels, last } = setup();
  const duel = duels.start("ember_rush");
  assert.equal(duels.resume(duel.id, "wrong"), null);
  assert.deepEqual(duels.resume(duel.id, "secret")!.legal, [{ type: "mulligan", uids: [] }]);
  duels.act(duel.id, { type: "mulligan", uids: [] });
  clock.advance(1000);
  // Play the human's turns as "end turn / pass" and let the AI do the rest.
  for (let i = 0; i < 400 && last().view.state.step !== "over"; i++) {
    const u = last();
    if (u.legal.some((a) => a.type === "pass")) duels.act(duel.id, { type: "pass" });
    else if (u.legal.some((a) => a.type === "endTurn")) duels.act(duel.id, { type: "endTurn" });
    clock.advance(1000);
  }
  const end = last().view.state;
  assert.equal(end.step, "over");
  assert.equal(end.winner, 1, "an AI beats a player who never plays a card");
  duels.dispose();
});

test("the server passes for the human when an Ambush window runs out", () => {
  const { clock, duels, last } = setup();
  const duel = duels.start("deepwall");
  duels.act(duel.id, { type: "mulligan", uids: [] });
  for (let i = 0; i < 400; i++) {
    clock.advance(500);
    const u = last();
    if (u.view.state.step === "over") break;
    if (u.window && u.window.responder === 0) {
      assert.equal(u.window.msLeft, WINDOW_MS);
      const seq = u.window.seq;
      clock.advance(WINDOW_MS);
      assert.ok(!last().window || last().window!.seq !== seq, "the window closed without the human acting");
      duels.dispose();
      return;
    }
    // Bind every turn so the human has Sigils (windows only open for someone who could pay for an Ambush).
    const bind = u.legal.find((a) => a.type === "bind");
    if (bind) duels.act(duel.id, bind);
    if (last().legal.some((a) => a.type === "endTurn")) duels.act(duel.id, { type: "endTurn" });
  }
  assert.fail("no Ambush window ever opened for the human");
});

test("client messages are validated", () => {
  assert.ok(clientMessageSchema.safeParse({ t: "act", duelId: "d1", action: { type: "endTurn" } }).success);
  assert.ok(!clientMessageSchema.safeParse({ t: "act", duelId: "d1", action: { type: "win" } }).success);
  assert.ok(!clientMessageSchema.safeParse({ t: "act", duelId: "d1", action: { type: "endTurn", lp: 0 } }).success);
  assert.ok(!clientMessageSchema.safeParse({ t: "new", deck: "cheat" }).success);
});

test("hurry messages are validated: a duel id and how long, nothing else", () => {
  assert.ok(clientMessageSchema.safeParse({ t: "hurry", duelId: "d1", until: "turn" }).success);
  assert.ok(clientMessageSchema.safeParse({ t: "hurry", duelId: "d1", until: "decision" }).success);
  assert.ok(!clientMessageSchema.safeParse({ t: "hurry", duelId: "d1", until: "forever" }).success);
  assert.ok(!clientMessageSchema.safeParse({ t: "hurry", duelId: "d1", until: "turn", action: { type: "pass" } }).success);
  assert.ok(!clientMessageSchema.safeParse({ t: "hurry", until: "turn" }).success);
});

/** Plays the human's side as "end turn" until it's the AI's move in its own Main step. */
function toAiTurn(t: ReturnType<typeof setup>, id: string) {
  t.duels.act(id, { type: "mulligan", uids: [] });
  for (let i = 0; i < 50; i++) {
    t.clock.advance(AI_DELAY.mulligan);
    const s = t.last().view.state;
    if (s.step === "main" && s.active === 1 && t.last().aiThinking) return;
    if (t.last().legal.some((a) => a.type === "endTurn")) t.duels.act(id, { type: "endTurn" });
  }
  assert.fail("never reached the AI's turn");
}

test("hurry drops the AI's thinking delay for the rest of its turn, and only that turn", () => {
  const t = setup();
  const duel = t.duels.start("deepwall");
  toAiTurn(t, duel.id);
  const turn = t.last().view.state.turn;
  const before = t.sent.length;
  t.duels.hurry(duel.id, "turn");
  t.clock.advance(AI_DELAY_HURRIED);
  assert.ok(t.sent.length > before, "the AI moved after the short delay");
  // Its whole turn goes by quickly, unless the human gets an Ambush window (never auto-passed).
  for (let i = 0; i < 40 && t.last().view.state.turn === turn && !t.last().legal.length; i++) t.clock.advance(AI_DELAY_HURRIED);
  const u = t.last();
  assert.ok(u.view.state.turn !== turn || u.legal.length > 0, "the AI's turn ended or the human has a decision");
  if (u.legal.some((a) => a.type === "endTurn")) {
    // The human's turn: back to normal pace for the AI's next turn.
    t.duels.act(duel.id, { type: "endTurn" });
    const n = t.sent.length;
    t.clock.advance(AI_DELAY_HURRIED);
    assert.equal(t.sent.length, n, "no hurry carried into the next AI turn");
    t.clock.advance(AI_DELAY.move);
    assert.ok(t.sent.length > n);
  }
  t.duels.dispose();
});

test("hurry until a decision ends when the human has something to decide", () => {
  const t = setup();
  const duel = t.duels.start("deepwall");
  toAiTurn(t, duel.id);
  t.duels.hurry(duel.id, "decision");
  for (let i = 0; i < 60 && !t.last().legal.length; i++) t.clock.advance(AI_DELAY_HURRIED);
  assert.ok(t.last().legal.length > 0, "the human got a decision");
  assert.ok(!t.last().view.state.window || t.last().window!.responder === 0);
  t.duels.dispose();
});

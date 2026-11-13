/**
 * The pure rules: `apply(state, player, action) -> { state, events }`. No I/O, no clock, no Math.random (the seeded RNG
 * lives in state), integers only, plain-JSON state. The input state is never mutated.
 */
import { card, CENTER_POOL, CREST_COST, deckList, type DeckDef } from "./cards.js";
import { legalActions, sameAction } from "./legal.js";
import { randInt, shuffle } from "./rng.js";
import {
  actors, atkOf, defOf, EMPTY_DECK_LOSS, HAND_LIMIT, MOVE_COST, OPENING_HAND, other, START_LP, windowOpens,
} from "./stats.js";
import {
  IllegalActionError, type Action, type ApplyResult, type AttackTarget, type GameEvent, type GameState, type Monster,
  type PendingWindow, type PlayerId, type PlayerState, type Position,
} from "./types.js";

type Events = GameEvent[];

export function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

export interface NewGame {
  seed: number;
  /** decks[0] is player 0's. */
  decks: [DeckDef, DeckDef];
  /** Who goes first; a coin flip from the seed if left out. */
  first?: PlayerId;
  /** Lane fields (homes and a random center place). Off by default: every lane is plain. */
  fields?: boolean;
}

export function createGame(opts: NewGame): ApplyResult {
  const s = { rng: opts.seed >>> 0, nextUid: 1 };
  const first: PlayerId = opts.first ?? (randInt(s, 2) as PlayerId);
  const center = opts.fields ? CENTER_POOL[randInt(s, CENTER_POOL.length)]! : null;
  const players = opts.decks.map((deck): PlayerState => {
    const ids = deckList(deck);
    shuffle(s, ids);
    return {
      lp: START_LP,
      deck: ids.map((id) => ({ uid: s.nextUid++, id })),
      hand: [], discard: [], sigils: [],
      monsters: [null, null, null], spells: [null, null, null],
      crest: deck.crest, home: deck.home, deckName: deck.name,
      bound: false, crestUsed: false, moved: false, ambushUsed: false, mulliganDone: false,
    };
  }) as [PlayerState, PlayerState];
  const state: GameState = {
    v: 1, rng: s.rng, nextUid: s.nextUid, turn: 0, active: first, first, step: "mulligan", players,
    fields: opts.fields ? [opts.decks[first].home, center, opts.decks[other(first)].home] : [null, null, null],
    window: null, windowSeq: 0, winner: null, endReason: null,
  };
  const events: Events = [{ t: "start", first, fields: [...state.fields] }];
  for (const p of [0, 1] as PlayerId[]) for (let i = 0; i < OPENING_HAND; i++) draw(state, p, events, false);
  return { state, events };
}

export function apply(state: GameState, player: PlayerId, action: Action): ApplyResult {
  if (state.step === "over") throw new IllegalActionError("the game is over");
  const s = clone(state);
  const events: Events = [];
  if (action.type === "concede") {
    endGame(s, other(player), "concede", events);
    return { state: s, events };
  }
  if (!actors(s).includes(player)) throw new IllegalActionError("not your move");
  if (action.type === "mulligan") {
    mulligan(s, player, action.uids, events);
  } else {
    if (!legalActions(s, player).some((a) => sameAction(a, action))) {
      throw new IllegalActionError(`illegal action ${JSON.stringify(action)}`);
    }
    perform(s, player, action, events);
  }
  checkWin(s, events);
  return { state: s, events };
}

// ---- turn structure ----

function mulligan(s: GameState, p: PlayerId, uids: number[], events: Events): void {
  if (s.step !== "mulligan") throw new IllegalActionError("not mulligan time");
  const pl = s.players[p];
  if (new Set(uids).size !== uids.length || !uids.every((u) => pl.hand.some((c) => c.uid === u))) {
    throw new IllegalActionError("mulligan cards must be in your hand");
  }
  const back = pl.hand.filter((c) => uids.includes(c.uid));
  pl.hand = pl.hand.filter((c) => !uids.includes(c.uid));
  pl.deck.push(...back);
  for (let i = 0; i < back.length; i++) draw(s, p, events, false);
  if (back.length) shuffle(s, pl.deck);
  pl.mulliganDone = true;
  events.push({ t: "mulligan", p, count: back.length });
  if (s.players[0].mulliganDone && s.players[1].mulliganDone) {
    draw(s, other(s.first), events, false); // making up for going second
    startTurn(s, s.first, events);
  }
}

function startTurn(s: GameState, p: PlayerId, events: Events): void {
  s.turn++;
  s.active = p;
  s.step = "main";
  const pl = s.players[p];
  pl.bound = pl.crestUsed = pl.moved = false;
  s.players[0].ambushUsed = s.players[1].ambushUsed = false;
  for (const sg of pl.sigils) sg.tapped = false;
  for (const m of pl.monsters) if (m) m.defStone = 0;
  events.push({ t: "turn", p, turn: s.turn });
  draw(s, p, events, false);
  s.fields.forEach((f, lane) => {
    if (f === "old_forest" && pl.monsters[lane]) changeLp(s, p, 1, "Old Forest", events);
  });
  checkDeaths(s, events);
}

function endTurn(s: GameState, events: Events): void {
  const p = s.active;
  if (!s.players[p].bound) {
    events.push({ t: "restDraw", p });
    draw(s, p, events, false);
  }
  for (const pl of s.players) {
    for (const m of pl.monsters) {
      if (!m) continue;
      m.damage = m.atkTurn = m.defTurn = 0;
      m.attacked = m.posChanged = false;
    }
  }
  events.push({ t: "endTurn", p });
  checkDeaths(s, events);
  if (checkWin(s, events)) return;
  startTurn(s, other(p), events);
}

function draw(s: GameState, p: PlayerId, events: Events, _fromEffect: boolean): void {
  const pl = s.players[p];
  const c = pl.deck.shift();
  if (!c) {
    events.push({ t: "emptyDeck", p, lp: pl.lp - EMPTY_DECK_LOSS });
    changeLp(s, p, -EMPTY_DECK_LOSS, "empty deck", events);
    return;
  }
  if (pl.hand.length >= HAND_LIMIT) {
    pl.discard.push(c);
    events.push({ t: "burnDraw", p, card: c.id });
    return;
  }
  pl.hand.push(c);
  events.push({ t: "draw", p, card: c.id, uid: c.uid });
}

function changeLp(s: GameState, p: PlayerId, delta: number, reason: string, events: Events): void {
  if (delta === 0) return;
  s.players[p].lp += delta;
  events.push({ t: "lp", p, delta, lp: s.players[p].lp, reason });
}

function endGame(s: GameState, winner: PlayerId, reason: string, events: Events): void {
  s.step = "over";
  s.window = null;
  s.winner = winner;
  s.endReason = reason;
  events.push({ t: "gameOver", winner, reason });
}

/** Ends the game if someone is at 0 LP. Both at once: the turn player wins. */
function checkWin(s: GameState, events: Events): boolean {
  if (s.step === "over") return true;
  const dead = ([0, 1] as PlayerId[]).filter((p) => s.players[p].lp <= 0);
  if (!dead.length) return false;
  endGame(s, dead.length === 2 ? s.active : other(dead[0]!), "LP", events);
  return true;
}

// ---- actions ----

function perform(s: GameState, p: PlayerId, a: Action, events: Events): void {
  const pl = s.players[p];
  switch (a.type) {
    case "bind": {
      const c = takeFromHand(pl, a.uid);
      pl.sigils.push({ uid: c.uid, id: c.id, tapped: false });
      pl.bound = true;
      events.push({ t: "bind", p, card: c.id });
      return;
    }
    case "summon": {
      const c = takeFromHand(pl, a.uid);
      const def = card(c.id);
      pay(s, p, def.cost);
      const old = pl.monsters[a.lane];
      if (old) {
        // Replace is not a destroy: no "when destroyed" trigger.
        pl.discard.push({ uid: old.uid, id: old.id });
        events.push({ t: "replace", p, card: old.id, lane: a.lane });
      }
      const awakened = !!def.awaken && pl.sigils.length >= def.awaken.n;
      pl.monsters[a.lane] = newMonster(s, c.uid, c.id, a.position, awakened);
      events.push({ t: "summon", p, card: c.id, lane: a.lane, position: a.position, awakened });
      onPlay(s, p, a.lane, c.id, a.targets ?? [], events);
      checkDeaths(s, events);
      return;
    }
    case "position": {
      const m = pl.monsters[a.lane]!;
      m.position = m.position === "atk" ? "def" : "atk";
      m.posChanged = true;
      events.push({ t: "position", p, lane: a.lane, position: m.position });
      checkDeaths(s, events);
      return;
    }
    case "cast": {
      const c = takeFromHand(pl, a.uid);
      pay(s, p, card(c.id).cost);
      events.push({ t: "cast", p, card: c.id });
      quickSpell(s, p, c.id, a.target, events);
      pl.discard.push(c);
      checkDeaths(s, events);
      return;
    }
    case "set": {
      const c = takeFromHand(pl, a.uid);
      pay(s, p, card(c.id).cost);
      pl.spells[a.lane] = { uid: c.uid, id: c.id, setTurn: s.turn };
      events.push({ t: "set", p, lane: a.lane, card: c.id });
      return;
    }
    case "flip": {
      const sp = pl.spells[a.lane]!;
      pl.spells[a.lane] = null;
      events.push({ t: "flip", p, lane: a.lane, card: sp.id });
      preparedSpell(s, p, a.lane, sp.id, a, events);
      pl.discard.push({ uid: sp.uid, id: sp.id });
      checkDeaths(s, events);
      return;
    }
    case "crest": {
      pay(s, p, CREST_COST);
      pl.crestUsed = true;
      events.push({ t: "crest", p, crest: pl.crest, lane: a.lane });
      if (pl.crest === "ember") buff(pl.monsters[a.lane!]!, p, a.lane!, 2, 0, events);
      else if (pl.crest === "stone") {
        pl.monsters[a.lane!]!.defStone += 2;
        events.push({ t: "buff", p, lane: a.lane!, atk: 0, def: 2 });
      } else if (pl.crest === "tide") changeLp(s, p, 2, "Tide", events);
      else moveMonster(s, p, a.lane!, a.to!, events);
      return;
    }
    case "move": {
      pay(s, p, MOVE_COST);
      pl.moved = true;
      moveMonster(s, p, a.from, a.to, events);
      return;
    }
    case "attackStep":
      s.step = "attack";
      events.push({ t: "attackStep", p });
      return;
    case "attack":
      declareAttack(s, p, a.lane, a.target, events);
      return;
    case "endTurn":
      endTurn(s, events);
      return;
    case "ambush":
      playAmbush(s, p, a.uid, events);
      return;
    case "pass": {
      const w = s.window!;
      s.window = null;
      events.push({ t: "pass", p });
      continueAfterWindow(s, w, false, events);
      return;
    }
    case "mulligan":
    case "concede":
      return;
  }
}

function takeFromHand(pl: PlayerState, uid: number) {
  const i = pl.hand.findIndex((c) => c.uid === uid);
  if (i < 0) throw new IllegalActionError("card not in hand");
  return pl.hand.splice(i, 1)[0]!;
}

function pay(s: GameState, p: PlayerId, n: number): void {
  const free = s.players[p].sigils.filter((x) => !x.tapped);
  if (free.length < n) throw new IllegalActionError("not enough Sigils");
  for (let i = 0; i < n; i++) free[i]!.tapped = true;
}

function newMonster(s: GameState, uid: number, id: string, position: Position, awakened: boolean): Monster {
  const aw = card(id).awaken;
  return {
    uid, id, position, damage: 0, entered: s.turn, posChanged: false, attacked: false,
    atkTurn: 0, defTurn: 0, defStone: 0,
    atkPerm: awakened && aw ? aw.atk : 0, defPerm: awakened && aw ? aw.def : 0,
  };
}

function moveMonster(s: GameState, p: PlayerId, from: number, to: number, events: Events): void {
  const ms = s.players[p].monsters;
  const swap = !!ms[to];
  [ms[from], ms[to]] = [ms[to] ?? null, ms[from] ?? null];
  events.push({ t: "move", p, from, to, swap });
  checkDeaths(s, events);
}

function buff(m: Monster, p: PlayerId, lane: number, atk: number, def: number, events: Events): void {
  m.atkTurn += atk;
  m.defTurn += def;
  events.push({ t: "buff", p, lane, atk, def });
}

// ---- removal ----

function destroy(s: GameState, p: PlayerId, lane: number, cause: "battle" | "effect", events: Events): void {
  const pl = s.players[p];
  const m = pl.monsters[lane];
  if (!m) return;
  pl.monsters[lane] = null;
  pl.discard.push({ uid: m.uid, id: m.id });
  events.push({ t: "destroyed", p, lane, card: m.id, cause });
  if (m.id === "kiln_golem") changeLp(s, other(p), -2, "Kiln Golem", events);
}

function bounce(s: GameState, p: PlayerId, lane: number, events: Events): void {
  const pl = s.players[p];
  const m = pl.monsters[lane];
  if (!m) return;
  pl.monsters[lane] = null;
  const c = { uid: m.uid, id: m.id };
  if (pl.hand.length >= HAND_LIMIT) pl.discard.push(c);
  else pl.hand.push(c);
  events.push({ t: "bounce", p, lane, card: m.id });
}

/** Anything whose DEF is at or below its damage is destroyed. Turn player first, lanes left to right. */
function checkDeaths(s: GameState, events: Events): void {
  for (const p of [s.active, other(s.active)]) {
    for (let lane = 0; lane < 3; lane++) {
      const m = s.players[p].monsters[lane];
      if (m && defOf(s, p, lane) <= m.damage) destroy(s, p, lane, "effect", events);
    }
  }
}

// ---- card effects ----

function onPlay(s: GameState, p: PlayerId, lane: number, id: string, targets: number[], events: Events): void {
  const o = other(p);
  const opp = s.players[o];
  switch (id) {
    case "ash_hound": {
      const m = opp.monsters[lane];
      if (m) buff(m, o, lane, 0, -2, events);
      return;
    }
    case "undertow_serpent":
      bounce(s, o, lane, events);
      return;
    case "elder_treant":
      for (let l = 0; l < 3; l++) if (opp.monsters[l] && defOf(s, o, l) <= 2) destroy(s, o, l, "effect", events);
      return;
    case "abyssal_leviathan":
      for (const l of targets) bounce(s, o, l, events);
      return;
  }
}

function quickSpell(
  s: GameState, p: PlayerId, id: string, target: { side: PlayerId; lane: number } | undefined, events: Events,
): void {
  const pl = s.players[p];
  switch (id) {
    case "spark":
      if (target && defOf(s, target.side, target.lane) <= 2) destroy(s, target.side, target.lane, "effect", events);
      return;
    case "firebolt":
      changeLp(s, other(p), -3, "Firebolt", events);
      return;
    case "rally":
      pl.monsters.forEach((m, l) => m && buff(m, p, l, 1, 0, events));
      return;
    case "insight":
      draw(s, p, events, true);
      draw(s, p, events, true);
      return;
  }
}

function preparedSpell(
  s: GameState, p: PlayerId, lane: number, id: string, a: Extract<Action, { type: "flip" }>, events: Events,
): void {
  const pl = s.players[p];
  const o = other(p);
  switch (id) {
    case "undermine": {
      const m = s.players[o].monsters[lane];
      if (!m) return;
      buff(m, o, lane, 0, -3, events);
      if (m.position !== "def") {
        m.position = "def";
        events.push({ t: "position", p: o, lane, position: "def" });
      }
      return;
    }
    case "warcry":
      pl.monsters.forEach((m, l) => m && Math.abs(l - lane) <= 1 && buff(m, p, l, 2, 0, events));
      return;
    case "second_wind": {
      if (a.uid === undefined || pl.monsters[lane]) return;
      const i = pl.discard.findIndex((c) => c.uid === a.uid);
      if (i < 0) return;
      const c = pl.discard.splice(i, 1)[0]!;
      pl.monsters[lane] = newMonster(s, c.uid, c.id, a.position ?? "def", false); // revives don't Awaken
      events.push({ t: "revive", p, lane, card: c.id });
      return;
    }
    case "rockslide":
      destroy(s, o, lane, "effect", events);
      return;
  }
}

// ---- battle ----

function declareAttack(s: GameState, p: PlayerId, lane: number, target: AttackTarget, events: Events): void {
  const m = s.players[p].monsters[lane]!;
  m.attacked = true;
  events.push({ t: "attack", p, lane, target, atk: atkOf(s, p, lane) });
  const w: PendingWindow = { kind: "attack", responder: other(p), attacker: lane, attackerUid: m.uid, target };
  if (!openWindow(s, w, events)) resolveBattle(s, lane, m.uid, target, events);
}

function openWindow(s: GameState, w: PendingWindow, events: Events): boolean {
  if (!windowOpens(s, w.responder, w.kind)) return false;
  s.window = w;
  s.windowSeq++;
  events.push({ t: "window", responder: w.responder, kind: w.kind });
  return true;
}

function attackerStill(s: GameState, lane: number, uid: number): Monster | null {
  const m = s.players[s.active].monsters[lane];
  return m && m.uid === uid ? m : null;
}

function playAmbush(s: GameState, p: PlayerId, uid: number, events: Events): void {
  const w = s.window!;
  const pl = s.players[p];
  const c = takeFromHand(pl, uid);
  pay(s, p, card(c.id).cost);
  pl.ambushUsed = true;
  s.window = null;
  events.push({ t: "ambush", p, card: c.id });
  pl.discard.push(c);
  let cancelled = false;
  switch (c.id) {
    case "brace":
      if (w.kind === "attack" && w.target.kind === "monster") {
        const m = pl.monsters[w.target.lane];
        if (m) buff(m, p, w.target.lane, 0, 3, events);
      }
      break;
    case "smoke":
      cancelled = true;
      events.push({ t: "cancelled", p: s.active, lane: w.attacker });
      break;
    case "snap_trap":
      if (attackerStill(s, w.attacker, w.attackerUid) && atkOf(s, s.active, w.attacker) <= 4) {
        destroy(s, s.active, w.attacker, "effect", events);
      }
      cancelled = true;
      break;
    case "riposte":
      if (attackerStill(s, w.attacker, w.attackerUid)) destroy(s, s.active, w.attacker, "effect", events);
      break;
  }
  checkDeaths(s, events);
  continueAfterWindow(s, w, cancelled, events);
}

function continueAfterWindow(s: GameState, w: PendingWindow, cancelled: boolean, events: Events): void {
  if (w.kind === "attack" && !cancelled) resolveBattle(s, w.attacker, w.attackerUid, w.target, events);
}

function resolveBattle(s: GameState, lane: number, uid: number, target: AttackTarget, events: Events): void {
  const p = s.active;
  const o = other(p);
  const a = attackerStill(s, lane, uid);
  if (!a) return;
  const atk = atkOf(s, p, lane);
  if (target.kind === "direct") {
    changeLp(s, o, -atk, "attack", events);
    return;
  }
  const tl = target.lane;
  const d = s.players[o].monsters[tl];
  if (!d) return; // the target left before the battle
  let defenderDied = false;
  if (d.position === "atk") {
    const datk = atkOf(s, o, tl);
    if (atk > datk) {
      destroy(s, o, tl, "battle", events);
      defenderDied = true;
      changeLp(s, o, datk - atk, "battle", events);
    } else if (atk < datk) {
      destroy(s, p, lane, "battle", events);
      changeLp(s, p, atk - datk, "battle", events);
    } else {
      destroy(s, p, lane, "battle", events);
      destroy(s, o, tl, "battle", events);
    }
  } else {
    d.damage += atk;
    events.push({ t: "damage", p: o, lane: tl, amount: atk, total: d.damage });
    if (d.damage >= defOf(s, o, tl)) {
      destroy(s, o, tl, "battle", events);
      defenderDied = true;
    }
  }
  if (checkWin(s, events)) return;
  if (defenderDied && attackerStill(s, lane, uid)) {
    openWindow(s, { kind: "destroyed", responder: o, attacker: lane, attackerUid: uid, lane: tl }, events);
  }
}

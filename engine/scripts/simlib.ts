/** AI-vs-AI games with invariant checks after every action. Used by the sim tests, `npm run sim` and `npm run balance`. */
import {
  actors, apply, card, chooseAction, createGame, DECKS, legalActions, viewFor, type GameState, type PlayerId,
} from "../src/index.js";

export interface SpellCounts {
  quick: number;
  set: number;
  flip: number;
  ambush: number;
}

export interface SimResult {
  turns: number;
  winner: PlayerId | null;
  winnerDeck: string | null;
  firstDeck: string;
  first: PlayerId;
  actions: number;
  decks: [string, string];
  /** Spells each player used: index is the player (decks[i]). */
  spells: [SpellCounts, SpellCounts];
  /** Attacks redirected by a Guard (target lane differs from the attacker's lane, or a Leap that a Guard stopped). */
  guardPulls: number;
  /** Attacks that hit a defense-position Guard at all. */
  guardHits: number;
  attacks: number;
  /** Longest run of turns (after turn 4) where no LP changed and no monster was destroyed or bounced. */
  longestQuiet: number;
}

const zero = (): SpellCounts => ({ quick: 0, set: 0, flip: 0, ambush: 0 });

export function checkInvariants(s: GameState): void {
  const lanes = s.players[0].monsters.length;
  for (const p of [0, 1] as PlayerId[]) {
    const pl = s.players[p];
    const total = pl.deck.length + pl.hand.length + pl.discard.length + pl.sigils.length +
      pl.monsters.filter(Boolean).length + pl.spells.filter(Boolean).length;
    if (total !== 30) throw new Error(`player ${p} has ${total} cards, not 30`);
    if (pl.hand.length > 7) throw new Error(`player ${p} hand ${pl.hand.length}`);
    if (pl.monsters.length !== lanes || pl.spells.length !== lanes) throw new Error("lane count changed");
    if (!Number.isInteger(pl.lp)) throw new Error("non-integer LP");
    for (const m of pl.monsters) if (m && (m.damage < 0 || (m.position === "atk" && m.damage > 0))) {
      throw new Error("bad damage");
    }
    if (pl.sigils.filter((x) => x.tapped).length > pl.sigils.length) throw new Error("bad sigils");
  }
  if (s.step !== "over") {
    for (const p of actors(s)) if (!legalActions(s, p).length) throw new Error(`player ${p} stuck`);
    if (s.players.some((pl) => pl.lp <= 0)) throw new Error("LP at 0 but game not over");
  }
}

export interface SimOptions {
  lanes?: number;
  maxActions?: number;
}

export function playAiGame(seed: number, decks: [string, string] = ["ember_rush", "deepwall"], opts: SimOptions = {}): SimResult {
  const maxActions = opts.maxActions ?? 3000;
  let s = createGame({ seed, decks: [DECKS[decks[0]]!, DECKS[decks[1]]!], lanes: opts.lanes }).state;
  let actions = 0;
  const spells: [SpellCounts, SpellCounts] = [zero(), zero()];
  let guardPulls = 0, guardHits = 0, attacks = 0, quiet = 0, longestQuiet = 0;
  let progress = false, lastTurn = s.turn;
  while (s.step !== "over") {
    if (++actions > maxActions) throw new Error(`seed ${seed}: game did not finish`);
    const p = actors(s)[0]!;
    const a = chooseAction(viewFor(s, p));
    if (a.type === "attack") {
      attacks++;
      if (a.target.kind === "monster") {
        const d = s.players[p === 0 ? 1 : 0].monsters[a.target.lane];
        if (d && d.position === "def" && card(d.id).guard) {
          guardHits++;
          const m = s.players[p].monsters[a.lane]!;
          if (a.target.lane !== a.lane || card(m.id).leap) guardPulls++;
        }
      }
    }
    const res = apply(s, p, a);
    for (const e of res.events) {
      if (e.t === "lp" || e.t === "destroyed" || e.t === "bounce") progress = true;
      if (e.t === "cast") spells[e.p].quick++;
      else if (e.t === "set") spells[e.p].set++;
      else if (e.t === "flip") spells[e.p].flip++;
      else if (e.t === "ambush") spells[e.p].ambush++;
    }
    s = res.state;
    checkInvariants(s);
    if (s.turn !== lastTurn) {
      // A turn after the opening where no LP changed and no monster left the board.
      quiet = !progress && lastTurn > 4 ? quiet + 1 : 0;
      longestQuiet = Math.max(longestQuiet, quiet);
      progress = false;
      lastTurn = s.turn;
    }
    if (s.turn > 200) throw new Error(`seed ${seed}: over 200 turns`);
  }
  return {
    turns: s.turn, winner: s.winner, winnerDeck: s.winner === null ? null : decks[s.winner], actions,
    firstDeck: decks[s.first], first: s.first, decks, spells, guardPulls, guardHits, attacks, longestQuiet,
  };
}

const r1 = (x: number) => Math.round(x * 10) / 10;

export function summarize(results: SimResult[]) {
  const n = results.length;
  const avg = results.reduce((t, r) => t + r.turns, 0) / n;
  const sorted = results.map((r) => r.turns).sort((a, b) => a - b);
  const wins: Record<string, number> = {};
  for (const r of results) if (r.winnerDeck) wins[r.winnerDeck] = (wins[r.winnerDeck] ?? 0) + 1;
  const firstWins = results.filter((r) => r.winner === r.first).length;
  // Spells per game, per deck.
  const spellsPerGame: Record<string, SpellCounts & { total: number }> = {};
  const games: Record<string, number> = {};
  for (const r of results) {
    r.decks.forEach((d, i) => {
      const t = (spellsPerGame[d] ??= { ...zero(), total: 0 });
      const c = r.spells[i]!;
      t.quick += c.quick; t.set += c.set; t.flip += c.flip; t.ambush += c.ambush;
      t.total += c.quick + c.set + c.ambush;
      games[d] = (games[d] ?? 0) + 1;
    });
  }
  for (const [d, t] of Object.entries(spellsPerGame)) {
    const g = games[d]!;
    spellsPerGame[d] = { quick: r1(t.quick / g), set: r1(t.set / g), flip: r1(t.flip / g), ambush: r1(t.ambush / g), total: r1(t.total / g) };
  }
  const attacks = results.reduce((t, r) => t + r.attacks, 0);
  return {
    games: n, avgTurns: r1(avg), medianTurns: sorted[Math.floor(n / 2)],
    minTurns: sorted[0], maxTurns: sorted[n - 1],
    in8to12: results.filter((r) => r.turns >= 8 && r.turns <= 12).length,
    under7: results.filter((r) => r.turns < 7).length,
    over20: results.filter((r) => r.turns > 20).length,
    wins, firstPlayerWins: firstWins, spellsPerGame,
    guardHitPct: r1((100 * results.reduce((t, r) => t + r.guardHits, 0)) / Math.max(1, attacks)),
    guardPullsPerGame: r1(results.reduce((t, r) => t + r.guardPulls, 0) / n),
    attacksPerGame: r1(attacks / n),
    /** Games with 4+ turns in a row (after turn 4) where nothing happened to LP or monsters. */
    stalls: results.filter((r) => r.longestQuiet >= 4).length,
  };
}

/** n games, decks alternating seats so each goes first about half the time. */
export function runMatchup(decks: [string, string], n: number, seed0 = 1000, opts: SimOptions = {}): SimResult[] {
  return Array.from({ length: n }, (_, i) =>
    playAiGame(seed0 + i, i % 2 ? [decks[1], decks[0]] : decks, opts));
}

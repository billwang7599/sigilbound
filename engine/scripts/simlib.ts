/** AI-vs-AI games with invariant checks after every action. Used by the sim test and `npm run sim`. */
import {
  actors, apply, chooseAction, createGame, DECKS, legalActions, viewFor, type GameState, type PlayerId,
} from "../src/index.js";

export interface SimResult {
  turns: number;
  winner: PlayerId | null;
  winnerDeck: string | null;
  firstDeck: string;
  actions: number;
}

export function checkInvariants(s: GameState): void {
  for (const p of [0, 1] as PlayerId[]) {
    const pl = s.players[p];
    const total = pl.deck.length + pl.hand.length + pl.discard.length + pl.sigils.length +
      pl.monsters.filter(Boolean).length + pl.spells.filter(Boolean).length;
    if (total !== 30) throw new Error(`player ${p} has ${total} cards, not 30`);
    if (pl.hand.length > 7) throw new Error(`player ${p} hand ${pl.hand.length}`);
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

export function playAiGame(seed: number, decks: [string, string] = ["ember_rush", "deepwall"], maxActions = 3000): SimResult {
  let s = createGame({ seed, decks: [DECKS[decks[0]]!, DECKS[decks[1]]!] }).state;
  let actions = 0;
  while (s.step !== "over") {
    if (++actions > maxActions) throw new Error(`seed ${seed}: game did not finish`);
    const p = actors(s)[0]!;
    const a = chooseAction(viewFor(s, p));
    s = apply(s, p, a).state;
    checkInvariants(s);
    if (s.turn > 200) throw new Error(`seed ${seed}: over 200 turns`);
  }
  return {
    turns: s.turn, winner: s.winner, winnerDeck: s.winner === null ? null : decks[s.winner], actions,
    firstDeck: decks[s.first],
  };
}

export function summarize(results: SimResult[]) {
  const n = results.length;
  const avg = results.reduce((t, r) => t + r.turns, 0) / n;
  const sorted = results.map((r) => r.turns).sort((a, b) => a - b);
  const wins: Record<string, number> = {};
  for (const r of results) if (r.winnerDeck) wins[r.winnerDeck] = (wins[r.winnerDeck] ?? 0) + 1;
  const firstWins = results.filter((r) => r.winnerDeck === r.firstDeck).length;
  return {
    games: n, avgTurns: Math.round(avg * 10) / 10, medianTurns: sorted[Math.floor(n / 2)],
    minTurns: sorted[0], maxTurns: sorted[n - 1], under7: results.filter((r) => r.turns < 7).length,
    wins, firstPlayerWins: firstWins,
  };
}

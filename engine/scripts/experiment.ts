/**
 * Try card/deck/rule tweaks without editing data: `tsx engine/scripts/experiment.ts <games> <lanes> '<patch json>'`.
 * Patch: { "cards": { "id": { "atk": 3 } }, "decks": { "deepwall": { "cards": { "smoke": 0 } } } }.
 */
import { CARDS, DECKS } from "../src/index.js";
import { runMatchup, summarize } from "./simlib.js";

const n = Number(process.argv[2] ?? 300);
const lanes = Number(process.argv[3] ?? 3);
const patch = JSON.parse(process.argv[4] ?? "{}") as {
  cards?: Record<string, Record<string, unknown>>; decks?: Record<string, { cards?: Record<string, number> }>;
};
for (const [id, p] of Object.entries(patch.cards ?? {})) Object.assign(CARDS[id]!, p);
for (const [id, p] of Object.entries(patch.decks ?? {})) {
  const d = DECKS[id]!;
  for (const [c, k] of Object.entries(p.cards ?? {})) { if (k) d.cards[c] = k; else delete d.cards[c]; }
  const total = Object.values(d.cards).reduce((a, b) => a + b, 0);
  if (total !== 30) throw new Error(`${id} has ${total} cards`);
}
const row = (name: string, decks: [string, string]) => {
  const r = runMatchup(decks, n, 1000, { lanes });
  const s = summarize(r);
  const byWinner = (d: string) => {
    const t = r.filter((x) => x.winnerDeck === d).map((x) => x.turns);
    return t.length ? Math.round((t.reduce((a, b) => a + b, 0) / t.length) * 10) / 10 : "-";
  };
  console.log(name.padEnd(8), `avg ${s.avgTurns} med ${s.medianTurns} 8-12 ${pct(s.in8to12)} >20 ${pct(s.over20)}`,
    `wins ${JSON.stringify(s.wins)} first ${pct(s.firstPlayerWins)} guardHit ${s.guardHitPct}% pulls ${s.guardPullsPerGame}`,
    `stall ${pct(s.stalls)} turnsByWinner E${byWinner("ember_rush")} D${byWinner("deepwall")}`,
    `spells E${s.spellsPerGame.ember_rush?.total ?? "-"} D${s.spellsPerGame.deepwall?.total ?? "-"}`);
};
const pct = (x: number) => `${Math.round((100 * x) / n)}%`;
const rows = process.argv[5] ?? "ED,EE,DD";
const full: Record<string, string> = { E: "ember_rush", D: "deepwall" };
for (const r of rows.split(",")) row(`${r[0]} v ${r[1]}`, [full[r[0]!]!, full[r[1]!]!]);

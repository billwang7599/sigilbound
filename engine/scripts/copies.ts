/**
 * 2-copy vs 3-copy deck limit: `tsx engine/scripts/copies.ts [games=500] [lanes=3]`. Same fixed seeds as balance.ts.
 * Decks: E/D are the standard 2-copy lists, E3/D3 the 3-copy lists, W3 the 3-copy cheap-wall Deepwall.
 */
import { runMatchup, summarize } from "./simlib.js";

const n = Number(process.argv[2] ?? 500);
const lanes = Number(process.argv[3] ?? 3);
const ids: Record<string, string> = {
  E: "ember_rush", D: "deepwall", E3: "ember_rush_3", D3: "deepwall_3", W3: "deepwall_3_walls",
};
const rows = (process.argv[4] ?? "E-D,E3-D3,E3-D,E-D3,E3-W3,E-W3,E-E,E3-E3,D-D,D3-D3,W3-W3").split(",");
const pct = (x: number) => `${Math.round((100 * x) / n)}%`;
for (const row of rows) {
  const [a, b] = row.split("-") as [string, string];
  const decks: [string, string] = [ids[a]!, ids[b]!];
  const s = summarize(runMatchup(decks, n, 1000, { lanes }));
  const sp = (d: string) => s.spellsPerGame[d]?.total ?? "-";
  const op = (d: string) => {
    const o = s.openings[d]!;
    return `noCheap ${o.noCheap}% noSummonT2 ${o.noSummonT2}% <2byT3 ${o.under2ByT3}% mull ${o.mulligan}`;
  };
  console.log(`${row.padEnd(6)} avg ${s.avgTurns} med ${s.medianTurns} 8-12 ${pct(s.in8to12)} >20 ${pct(s.over20)}`,
    `| ${a} wins ${pct(s.wins[decks[0]] ?? 0)}${a === b ? "" : ` ${b} ${pct(s.wins[decks[1]] ?? 0)}`}`,
    `| first ${pct(s.firstPlayerWins)} stall ${pct(s.stalls)} | spells ${a} ${sp(decks[0])} ${b} ${sp(decks[1])}`,
    `\n       ${a}: ${op(decks[0])}${a === b ? "" : `\n       ${b}: ${op(decks[1])}`}`);
}

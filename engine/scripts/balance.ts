/**
 * Balance report: `npm run balance -- [games=500] [lanes=3]`. Fixed seeds, decks alternate seats, so runs are
 * reproducible and each deck goes first about half the time.
 */
import { DECKS } from "../src/index.js";
import { runMatchup, summarize } from "./simlib.js";

const n = Number(process.argv[2] ?? 500);
const lanes = Number(process.argv[3] ?? 3);
const ids = Object.keys(DECKS);
const t0 = Date.now();
for (let i = 0; i < ids.length; i++) {
  for (let j = i; j < ids.length; j++) {
    const res = runMatchup([ids[i]!, ids[j]!], n, 1000, { lanes });
    console.log(`${ids[i]} vs ${ids[j]} (${lanes} lanes)`, JSON.stringify(summarize(res), null, 1));
  }
}
console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`);

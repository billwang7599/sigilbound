import { playAiGame, summarize } from "./simlib.js";

const n = Number(process.argv[2] ?? 100);
const t0 = Date.now();
const results = Array.from({ length: n }, (_, i) => playAiGame(1000 + i, i % 2 ? ["deepwall", "ember_rush"] : ["ember_rush", "deepwall"]));
console.log(summarize(results), `${((Date.now() - t0) / 1000).toFixed(1)}s`);

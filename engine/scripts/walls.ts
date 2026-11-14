/** How often Guard / 0-ATK monsters end their owner's turn in defense: `tsx engine/scripts/walls.ts [games=200]`. */
import { runMatchup } from "./simlib.js";

const n = Number(process.argv[2] ?? 200);
for (const d of [["ember_rush", "deepwall"], ["deepwall", "deepwall"]] as [string, string][]) {
  const r = runMatchup(d, n, 1000);
  const t = r.reduce((a, x) => a + x.wallEnds.total, 0), df = r.reduce((a, x) => a + x.wallEnds.def, 0);
  console.log(d.join(" v "), `${df}/${t} in defense (${((100 * df) / t).toFixed(1)}%)`);
}

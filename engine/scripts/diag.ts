/** Per-card diagnostics: `tsx engine/scripts/diag.ts [games] [lanes]`. For each spell: games held in hand, times used, times bound as a Sigil. */
import { actors, apply, card, chooseAction, createGame, DECKS, viewFor, type PlayerId } from "../src/index.js";
const n = Number(process.argv[2] ?? 200);
const lanes = Number(process.argv[3] ?? 3);
const held: Record<string, number> = {}, used: Record<string, number> = {}, bound: Record<string, number> = {};
let zeroGames = 0;
for (let i = 0; i < n; i++) {
  const decks: [string, string] = i % 2 ? ["deepwall", "ember_rush"] : ["ember_rush", "deepwall"];
  let s = createGame({ seed: 1000 + i, decks: [DECKS[decks[0]]!, DECKS[decks[1]]!], lanes }).state;
  const seen = new Set<string>();
  const dw = decks.indexOf("deepwall") as PlayerId;
  let dwSpells = 0;
  while (s.step !== "over") {
    const p = actors(s)[0]!;
    for (const c of s.players[p].hand) if (card(c.id).kind !== "monster") seen.add(`${decks[p]}:${c.id}:${c.uid}`);
    const a = chooseAction(viewFor(s, p));
    const r = apply(s, p, a);
    for (const e of r.events) {
      if (e.t === "cast" || e.t === "set" || e.t === "ambush") {
        const k = `${decks[e.p]}:${e.card}`; used[k] = (used[k] ?? 0) + 1; if (e.p === dw) dwSpells++;
      }
      if (e.t === "bind" && e.card && card(e.card).kind !== "monster") {
        const k = `${decks[e.p]}:${e.card}`; bound[k] = (bound[k] ?? 0) + 1;
      }
    }
    s = r.state;
  }
  for (const k of seen) { const kk = k.split(":").slice(0, 2).join(":"); held[kk] = (held[kk] ?? 0) + 1; }
  if (dwSpells === 0) zeroGames++;
}
console.log("card".padEnd(28), "held used bound");
for (const k of Object.keys(held).sort()) console.log(k.padEnd(28), held[k], used[k] ?? 0, bound[k] ?? 0);
console.log(`deepwall games with 0 spells: ${zeroGames}/${n}`);

import assert from "node:assert/strict";
import { test } from "node:test";
import { installCanvasShim, pixelsOf } from "./tools/canvas-shim.js";

installCanvasShim();
const W = await import("../src/core/world.js");
const { NPCS, playerDeckAgainst } = await import("../src/data/npcs.js");
const { session } = await import("../src/world/session.js");
const duel = await import("../src/world/duel.js");
const art = await import("../src/world/art.js");
const { HUB, TILE, buildMap, collides, isBlocked, step, talkTarget, tileFeet, solidTiles, camera, facingFor, HIT } = W;
type Input = import("../src/core/world.js").Input;

const hold = (p: Partial<Input>): Input => ({ up: false, down: false, left: false, right: false, ...p });
const walk = (m = HUB, from: { x: number; y: number }, input: Input, ms: number, extra?: Set<string>) => {
  let w = { pos: from, facing: "down" as const as import("../src/core/world.js").Dir, moving: false };
  for (let t = 0; t < ms; t += 16) w = step(m, w, input, 16, extra);
  return w;
};
const npcSolid = solidTiles(NPCS.map((n) => ({ id: n.id, pos: tileFeet(n.tile.x, n.tile.y) })));

test("the hub is 30×20, walled by trees, and the start is clear", () => {
  assert.equal(HUB.w, 30);
  assert.equal(HUB.h, 20);
  for (let x = 0; x < HUB.w; x++) { assert.ok(isBlocked(HUB, x, 0)); assert.ok(isBlocked(HUB, x, HUB.h - 1)); }
  for (let y = 0; y < HUB.h; y++) { assert.ok(isBlocked(HUB, 0, y)); assert.ok(isBlocked(HUB, HUB.w - 1, y)); }
  assert.ok(!collides(HUB, HUB.start, npcSolid));
  assert.ok(HUB.ground.includes("water") && HUB.ground.includes("path") && HUB.ground.includes("flowers"));
  for (const k of ["tree", "house", "stall", "fence", "well"] as const) assert.ok(HUB.props.some((p) => p.kind === k), k);
});

test("every NPC stands on open ground and can be walked up to from the start", () => {
  // Flood fill over open tiles from the start tile.
  const seen = new Set<string>();
  const q = [{ x: Math.floor(HUB.start.x / TILE), y: Math.floor(HUB.start.y / TILE) }];
  while (q.length) {
    const t = q.pop()!;
    const k = `${t.x},${t.y}`;
    if (seen.has(k) || isBlocked(HUB, t.x, t.y, npcSolid)) continue;
    seen.add(k);
    q.push({ x: t.x + 1, y: t.y }, { x: t.x - 1, y: t.y }, { x: t.x, y: t.y + 1 }, { x: t.x, y: t.y - 1 });
  }
  for (const n of NPCS) {
    assert.ok(!isBlocked(HUB, n.tile.x, n.tile.y), `${n.id} stands on a blocked tile`);
    const beside = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(`${n.tile.x + dx!},${n.tile.y + dy!}`));
    assert.ok(beside, `${n.id} can't be reached`);
  }
  assert.ok(NPCS.length >= 3 && NPCS.length <= 4);
  for (const n of NPCS) assert.ok(n.lines.length >= 1 && n.win && n.lose);
});

test("you can't walk through a blocked tile: you stop flush against it", () => {
  const m = buildMap(["....", ".o..", "...."], [], { x: 8, y: 8 });
  // Standing left of the rock at (1,1), walking right: stops with the hitbox's right edge at the rock's left edge.
  const w = walk(m, { x: 5, y: 1 * TILE + 12 }, hold({ right: true }), 1000);
  assert.equal(w.pos.x + HIT.halfW, 1 * TILE);
  assert.ok(!collides(m, w.pos));
  // And from above, walking down onto it.
  const d = walk(m, { x: 1 * TILE + 8, y: 6 }, hold({ down: true }), 1000);
  assert.equal(d.pos.y, 1 * TILE);
});

test("you stay inside the map even with nothing around the edge", () => {
  const m = buildMap(["...", "...", "..."], [], { x: 24, y: 24 });
  const tl = walk(m, { x: 24, y: 24 }, hold({ left: true, up: true }), 3000);
  assert.ok(tl.pos.x - HIT.halfW >= 0 && tl.pos.y - HIT.up >= 0, JSON.stringify(tl.pos));
  const br = walk(m, { x: 24, y: 24 }, hold({ right: true, down: true }), 3000);
  assert.ok(br.pos.x + HIT.halfW <= 3 * TILE && br.pos.y <= 3 * TILE, JSON.stringify(br.pos));
});

test("pushing diagonally into a wall slides along it", () => {
  const m = buildMap(["######", "......", "......"], [], { x: 8, y: 40 });
  const start = { x: 20, y: TILE + HIT.up }; // touching the fence row above
  const w = walk(m, start, hold({ up: true, right: true }), 300);
  assert.equal(w.pos.y, start.y);
  assert.ok(w.pos.x > start.x + 10);
  assert.ok(w.moving);
});

test("diagonals aren't faster than straight lines", () => {
  const m = buildMap(Array(12).fill("............"), [], { x: 96, y: 96 });
  const s = step(m, { pos: { x: 96, y: 96 }, facing: "down", moving: false }, hold({ right: true }), 100);
  const d = step(m, { pos: { x: 96, y: 96 }, facing: "down", moving: false }, hold({ right: true, down: true }), 100);
  const ds = Math.hypot(s.pos.x - 96, s.pos.y - 96), dd = Math.hypot(d.pos.x - 96, d.pos.y - 96);
  assert.ok(Math.abs(ds - dd) < 1.01, `${ds} vs ${dd}`);
});

test("facing follows the keys and doesn't flicker on diagonals", () => {
  assert.equal(facingFor(hold({ left: true }), "down"), "left");
  assert.equal(facingFor(hold({ up: true, left: true }), "left"), "left");
  assert.equal(facingFor(hold({ up: true, left: true }), "right"), "up");
  assert.equal(facingFor(hold({}), "right"), "right");
  assert.equal(facingFor(hold({ up: true, down: true }), "left"), "left");
});

test("NPCs are solid", () => {
  const m = buildMap(Array(5).fill("....."), [], { x: 8, y: 8 });
  const solid = solidTiles([{ id: "a", pos: tileFeet(3, 2) }]);
  const w = walk(m, tileFeet(1, 2), hold({ right: true }), 1000, solid);
  assert.equal(w.pos.x + HIT.halfW, 3 * TILE);
});

test("talk target: the NPC in front, else the nearest within range, else nobody", () => {
  const a = { id: "a", pos: tileFeet(5, 5) }, b = { id: "b", pos: tileFeet(3, 5) };
  // Standing between them, facing a: talk to a even though b is as close.
  const mid = tileFeet(4, 5);
  assert.equal(talkTarget({ pos: mid, facing: "right" }, [a, b]), "a");
  assert.equal(talkTarget({ pos: mid, facing: "left" }, [a, b]), "b");
  // Facing away from both but still close: the nearest one.
  assert.equal(talkTarget({ pos: { x: mid.x + 2, y: mid.y }, facing: "up" }, [a, b]), "a");
  // Too far.
  assert.equal(talkTarget({ pos: tileFeet(9, 9), facing: "up" }, [a, b]), null);
  // In front, a tile and a bit away.
  assert.equal(talkTarget({ pos: tileFeet(5, 7), facing: "up" }, [a]), null);
  assert.equal(talkTarget({ pos: { x: a.pos.x, y: a.pos.y + 20 }, facing: "up" }, [a]), "a");
});

test("the camera follows and stops at the map edges", () => {
  const vw = 320, vh = 192;
  assert.deepEqual(camera(HUB, { x: 0, y: 0 }, vw, vh), { x: 0, y: 0 });
  const far = camera(HUB, { x: 9999, y: 9999 }, vw, vh);
  assert.deepEqual(far, { x: HUB.w * TILE - vw, y: HUB.h * TILE - vh });
  const mid = camera(HUB, { x: 240, y: 168 }, vw, vh);
  assert.equal(mid.x, 240 - vw / 2);
  assert.ok(Number.isInteger(mid.x) && Number.isInteger(mid.y));
  // A view bigger than the map centres it.
  assert.ok(camera(HUB, { x: 0, y: 0 }, 600, 400).x < 0);
});

test("world → duel → world keeps your spot and remembers the result", () => {
  const s0 = W.freshSession();
  const at = { x: 200, y: 150 };
  const s1 = W.beginDuel(s0, "hina", at, "left");
  assert.deepEqual(s1.duel, { npcId: "hina" });
  const s2 = W.endDuel(s1, true);
  assert.deepEqual(s2.pos, at);
  assert.equal(s2.facing, "left");
  assert.equal(s2.duel, null);
  assert.deepEqual(s2.aftermath, { npcId: "hina", won: true });
  assert.equal(W.clearAftermath(s2).aftermath, null);
  // Ending with no duel in progress changes nothing; abandoning keeps the spot but no result.
  assert.equal(W.endDuel(s2, false), s2);
  const s3 = W.abandonDuel(s1);
  assert.equal(s3.duel, null);
  assert.equal(s3.aftermath, null);
  assert.deepEqual(s3.pos, at);
});

test("saved sessions: garbage gives a fresh one, a spot inside a wall is dropped", () => {
  const fresh = W.freshSession();
  for (const bad of [null, "", "{", "[]", 42, { pos: "x" }, { pos: { x: NaN, y: 1 } }]) assert.deepEqual(W.parseSession(bad), fresh);
  const inTree = W.parseSession({ pos: { x: 8, y: 12 }, facing: "left" });
  assert.deepEqual(inTree.pos, fresh.pos);
  assert.equal(inTree.facing, "left");
  const ok = W.parseSession(JSON.stringify({ pos: { x: 200, y: 150 }, facing: "up", duel: { npcId: "bram" }, aftermath: null }));
  assert.deepEqual(ok, { pos: { x: 200, y: 150 }, facing: "up", duel: { npcId: "bram" }, aftermath: null });
});

test("duel glue: challenge an NPC with the other deck, then return to the world with the result", () => {
  const calls: string[] = [];
  const actions = {
    newDuel: (d: string) => calls.push(`new:${d}`),
    // Like the controller: a world duel's leave() goes back to the world, abandoning it.
    leave: () => { calls.push(`leave:${session.get().duel ? "world" : "title"}`); if (session.get().duel) session.abandonDuel(); },
  };
  const ui = { go: (s: string) => calls.push(`go:${s}`) };
  const hina = NPCS.find((n) => n.id === "hina")!;
  assert.equal(playerDeckAgainst(hina), "deepwall");
  duel.startDuel(actions, hina, { pos: { x: 300, y: 120 }, facing: "right" });
  assert.deepEqual(calls, ["new:deepwall"]);
  assert.equal(duel.worldDuelNpc()?.id, "hina");
  duel.rematch(actions);
  assert.deepEqual(calls.at(-1), "new:deepwall");
  duel.returnToWorld(ui as never, actions, false);
  assert.deepEqual(calls.slice(-2), ["leave:title", "go:world"]);
  assert.deepEqual(session.get().pos, { x: 300, y: 120 });
  assert.deepEqual(session.get().aftermath, { npcId: "hina", won: false });
  assert.equal(duel.worldDuelNpc(), null);
  // Menu from a world duel: back to the title, no result.
  duel.startDuel(actions, hina, { pos: { x: 300, y: 120 }, facing: "right" });
  duel.leaveToTitle(actions);
  assert.equal(calls.at(-1), "leave:title");
  assert.equal(session.get().duel, null);
  assert.equal(session.get().aftermath, null);
});

test("the hub's art renders: ground covers every pixel, every prop draws something", () => {
  const g = art.groundCanvas(HUB);
  assert.equal(g.width, HUB.w * TILE);
  assert.equal(g.height, HUB.h * TILE);
  const px = pixelsOf(g);
  for (let i = 3; i < px.length; i += 4 * 97) assert.equal(px[i], 255);
  for (const p of HUB.props) {
    const a = art.propArt(p, HUB);
    const d = pixelsOf(a.canvas);
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++;
    assert.ok(n > 20, `${p.kind} at ${p.x},${p.y} is empty`);
  }
});

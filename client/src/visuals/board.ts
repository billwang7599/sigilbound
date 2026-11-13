/**
 * The board (a playmat), drawn with Pixi at a small fixed resolution (BOARD_W × BOARD_H) and scaled up by a whole
 * number with `image-rendering: pixelated`, so every art pixel is a crisp square.
 *
 * Display objects persist between updates (keyed by side and lane), so changes animate instead of snapping:
 * `animate(event)` plays one server event, and `sync(state)` tweens whatever is left over into place. Pixi only
 * draws; the controller decides what pointer input means, using `keysAt` and the server's legal actions.
 */
import { Application, Container, Graphics, Sprite, Text, Texture, TextureSource, TilingSprite } from "pixi.js";
import {
  atkOf, card, defOf, hasLeap, isGuarding, type GameEvent, type GameState, type Monster, type PlayerId,
} from "@sigilbound/engine";
import { diff, emptyShown, wanted, type Shown } from "../core/reconcile.js";
import { digitsCanvas } from "../gfx/digits.js";
import { AFFINITY, UI } from "../gfx/palette.js";
import {
  artCanvas, badgeCanvas, cardBackCanvas, laneTileCanvas, monsterCanvas, sigilCardCanvas, spellCanvas,
  tableTileCanvas, tinyBackCanvas,
} from "../gfx/sprites.js";

export const BOARD_W = 336;
export const BOARD_H = 216;
const LANE_X = [80, 144, 208];
const LANE_W = 64;
const CARD_W = 56, CARD_H = 68;
const ROWS = { opp: { spell: 4, monster: 24 }, me: { spell: 196, monster: 124 } };
const SIGIL_ORIGIN = { opp: { x: 4, y: 36 }, me: { x: 4, y: 120 } };
const DECK_AT = { opp: { x: 6, y: 10 }, me: { x: 6, y: 190 } };
const DISCARD_AT = { opp: { x: 284, y: 52 }, me: { x: 284, y: 126 } };
const LP_AT = { opp: { x: 280, y: 14 }, me: { x: 280, y: 186 } };

export type Side = "me" | "opp";
export interface Rect { x: number; y: number; w: number; h: number }

TextureSource.defaultOptions.scaleMode = "nearest";

const textures = new Map<HTMLCanvasElement, Texture>();
function tex(c: HTMLCanvasElement): Texture {
  let t = textures.get(c);
  if (!t) {
    t = Texture.from(c);
    t.source.scaleMode = "nearest";
    textures.set(c, t);
  }
  return t;
}

const hex = (s: string) => parseInt(s.replace("#", "").slice(0, 6), 16);
const ease = (k: number) => 1 - (1 - k) * (1 - k);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const R = Math.round;

function border(g: Graphics, r: Rect, color: number, alpha = 1, t = 1): void {
  g.rect(r.x, r.y, r.w, t).fill({ color, alpha });
  g.rect(r.x, r.y + r.h - t, r.w, t).fill({ color, alpha });
  g.rect(r.x, r.y + t, t, r.h - 2 * t).fill({ color, alpha });
  g.rect(r.x + r.w - t, r.y + t, t, r.h - 2 * t).fill({ color, alpha });
}

function dashed(g: Graphics, r: Rect, color: number, alpha: number): void {
  for (let i = 0; i < r.w; i += 3) {
    g.rect(r.x + i, r.y, 1, 1).fill({ color, alpha });
    g.rect(r.x + i, r.y + r.h - 1, 1, 1).fill({ color, alpha });
  }
  for (let i = 0; i < r.h; i += 3) {
    g.rect(r.x, r.y + i, 1, 1).fill({ color, alpha });
    g.rect(r.x + r.w - 1, r.y + i, 1, 1).fill({ color, alpha });
  }
}

function label(text: string, color: string | number = UI.paper): Text {
  const t = new Text({ text, style: { fontFamily: "Silkscreen", fontSize: 8, fill: typeof color === "string" ? hex(color) : color }, resolution: 1 });
  t.roundPixels = true;
  return t;
}

export function monsterRect(side: Side, lane: number): Rect {
  return { x: LANE_X[lane]! + 4, y: ROWS[side].monster, w: CARD_W, h: CARD_H };
}
export function spellRect(side: Side, lane: number): Rect {
  return { x: LANE_X[lane]! + 20, y: ROWS[side].spell, w: 24, h: 16 };
}
function sigilZone(side: Side): Rect {
  return side === "me" ? { x: 0, y: 112, w: 76, h: 104 } : { x: 0, y: 0, w: 76, h: 104 };
}
function deckRect(side: Side): Rect { return { ...DECK_AT[side], w: 16, h: 20 }; }
function discardRect(side: Side): Rect { return { ...DISCARD_AT[side], w: 28, h: 34 }; }
const FACE: Rect = { x: 274, y: 0, w: 62, h: 108 };
const FIELD: Rect = { x: 76, y: 0, w: 198, h: BOARD_H };

function sigilCell(side: Side, i: number, n: number): { x: number; y: number } {
  const cols = n > 12 ? 6 : 4, dx = n > 12 ? 11 : 17;
  const o = SIGIL_ORIGIN[side];
  const col = i % cols, row = Math.floor(i / cols);
  return { x: o.x + col * dx + 8, y: o.y + row * 20 + 9 };
}

/** Board places, as keys the controller understands. Most specific first. */
export function rectOfKey(key: string): Rect | null {
  const [a, b, c] = key.split(":");
  if (key === "face") return FACE;
  if (key === "field") return FIELD;
  if (key === "sigils") return sigilZone("me");
  if (a === "deck") return deckRect(b as Side);
  if (a === "discard") return discardRect(b as Side);
  if (b === "monster") return monsterRect(a as Side, Number(c));
  if (b === "spell") return spellRect(a as Side, Number(c));
  return null;
}

const inside = (r: Rect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

interface Tween { t0: number; dur: number; step(k: number): void; resolve(): void }

class MonsterView {
  readonly holder = new Container();
  readonly body = new Container();
  readonly art: Sprite;
  readonly overlay = new Container();
  position: "atk" | "def";
  constructor(readonly uid: number, readonly id: string, readonly side: Side, position: "atk" | "def") {
    const def = card(id);
    const pal = AFFINITY[def.affinity];
    const frame = new Graphics();
    frame.rect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H).fill(hex(pal.frameDark));
    frame.rect(-CARD_W / 2 + 1, -CARD_H / 2 + 1, CARD_W - 2, CARD_H - 2).fill(hex(pal.frame));
    frame.rect(-CARD_W / 2 + 3, -CARD_H / 2 + 3, CARD_W - 6, 50).fill(hex("#2a2438"));
    frame.rect(-CARD_W / 2 + 3, -CARD_H / 2 + 3, CARD_W - 6, 1).fill({ color: 0x000000, alpha: 0.4 });
    this.body.addChild(frame);
    this.art = new Sprite(tex(monsterCanvas(id)));
    this.art.scale.set(side === "opp" ? -2 : 2, 2);
    this.art.position.set(side === "opp" ? 24 : -24, -CARD_H / 2 + 4);
    this.body.addChild(this.art);
    this.position = position;
    this.body.rotation = position === "def" ? Math.PI / 2 : 0;
    this.holder.addChild(this.body, this.overlay);
  }

  /** Stats plate and keyword badges (never rotated, so they stay readable). */
  refresh(s: GameState, p: PlayerId, lane: number, m: Monster): void {
    this.overlay.removeChildren().forEach((c) => c.destroy());
    const def = card(m.id);
    const ownersTurn = s.active === p;
    this.art.tint = ownersTurn && m.position === "atk" && (m.attacked || m.entered === s.turn) ? 0x9a94a8 : 0xffffff;
    const atk = atkOf(s, p, lane), dfn = defOf(s, p, lane);
    const atkS = new Sprite(tex(digitsCanvas(String(atk), m.position === "atk" ? "#ffb35c" : "#a89a8a")));
    const defS = new Sprite(tex(digitsCanvas(String(dfn - m.damage), m.damage > 0 ? UI.target : m.position === "def" ? "#9fd3ff" : "#a8b8c8")));
    const slash = new Sprite(tex(digitsCanvas("/", "#ffffff")));
    const pw = atkS.width + defS.width + 9;
    const plate = new Container();
    plate.addChild(new Graphics().rect(-Math.ceil(pw / 2), 0, pw, 9).fill({ color: 0x1c1a24, alpha: 0.85 }));
    atkS.position.set(-Math.ceil(pw / 2) + 1, 1);
    slash.position.set(atkS.x + atkS.width - 1, 1);
    defS.position.set(slash.x + slash.width - 1, 1);
    plate.addChild(atkS, slash, defS);
    plate.position.set(0, m.position === "def" ? CARD_W / 2 - 6 : CARD_H / 2 - 12);
    this.overlay.addChild(plate);
    const badges: ("guard" | "leap" | "rush" | "awaken")[] = [];
    if (def.guard) badges.push("guard");
    if (hasLeap(s, lane, m)) badges.push("leap");
    if (def.rush && s.players[p].sigils.length <= 3) badges.push("rush");
    if (m.atkPerm || m.defPerm) badges.push("awaken");
    badges.forEach((b, i) => {
      const bs = new Sprite(tex(badgeCanvas(b)));
      const top = m.position === "def" ? -CARD_W / 2 : -CARD_H / 2;
      const right = m.position === "def" ? CARD_H / 2 : CARD_W / 2;
      bs.position.set(right - 8 - i * 8, top + 1);
      if (b === "guard" && !isGuarding(m)) bs.alpha = 0.4;
      this.overlay.addChild(bs);
    });
  }
}

interface SpellView { sig: string; id: string; sprite: Sprite }
interface SigilView { sprite: Sprite; tapped: boolean }

export class BoardView {
  private readonly bg = new Container();
  private readonly piles = new Container();
  private readonly sigilLayer = new Container();
  private readonly spellLayer = new Container();
  private readonly monsterLayer = new Container();
  private readonly marks = new Graphics();
  private readonly aim = new Graphics();
  private readonly fx = new Container();
  private tweens: Tween[] = [];
  private time = 0;
  private host: HTMLElement | null = null;
  private readonly resizeObs = new ResizeObserver(() => this.fit());
  private scale = 1;

  private monsters = new Map<string, MonsterView>();
  private spells = new Map<string, SpellView>();
  private sigils: Record<Side, SigilView[]> = { me: [], opp: [] };
  private lpShown: Record<Side, number | null> = { me: null, opp: null };
  private deckShown: Record<Side, number> = { me: 0, opp: 0 };
  private lpSprites: Record<Side, Container> = { me: new Container(), opp: new Container() };
  /** 1 = normal speed; smaller is faster; 0 = instant. */
  speed = 1;
  private me: PlayerId = 0;

  private constructor(private readonly app: Application) {
    app.stage.addChild(this.bg, this.piles, this.sigilLayer, this.spellLayer, this.monsterLayer, this.marks, this.aim, this.fx);
    this.drawBackground();
    app.ticker.add((t) => {
      this.time += t.deltaMS;
      const now = performance.now();
      const keep: Tween[] = [];
      for (const tw of this.tweens) {
        if (now < tw.t0) { keep.push(tw); continue; }
        const k = tw.dur <= 0 ? 1 : Math.min(1, (now - tw.t0) / tw.dur);
        try { tw.step(k); } catch { /* the object went away mid-tween */ }
        if (k >= 1) tw.resolve();
        else keep.push(tw);
      }
      this.tweens = keep;
      this.marks.alpha = 0.7 + 0.3 * Math.sin(this.time / 160);
    });
  }

  static async create(host: HTMLElement): Promise<BoardView> {
    const app = new Application();
    await app.init({
      width: BOARD_W, height: BOARD_H, background: "#1c1a24", antialias: false, resolution: 1, roundPixels: true,
      autoDensity: false,
    });
    app.canvas.style.imageRendering = "pixelated";
    app.canvas.classList.add("board-canvas");
    const view = new BoardView(app);
    view.mount(host);
    return view;
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  mount(host: HTMLElement): void {
    if (this.host === host) return;
    this.resizeObs.disconnect();
    this.host = host;
    host.appendChild(this.app.canvas);
    this.resizeObs.observe(host);
    this.fit();
  }

  /** Whole-number scaling when there's room. */
  private fit(): void {
    if (!this.host) return;
    const { clientWidth: w, clientHeight: h } = this.host;
    // Whole numbers keep pixels square. Below 1× there's no crisp option, so shrink rather than overflow: an
    // overflowing canvas slides under the HUD around it, and cards on it look like they were never played.
    const fit = Math.min(w / BOARD_W, h / BOARD_H);
    this.scale = fit >= 1 ? Math.floor(fit) : Math.max(0.25, fit);
    this.app.canvas.style.width = `${BOARD_W * this.scale}px`;
    this.app.canvas.style.height = `${BOARD_H * this.scale}px`;
  }

  // ---- geometry for the controller ----

  toBoard(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.app.canvas.getBoundingClientRect();
    return { x: (clientX - r.left) / this.scale, y: (clientY - r.top) / this.scale };
  }

  /** Every place under a client point, most specific first. */
  keysAt(clientX: number, clientY: number): string[] {
    const { x, y } = this.toBoard(clientX, clientY);
    if (x < 0 || y < 0 || x >= BOARD_W || y >= BOARD_H) return [];
    const out: string[] = [];
    for (const side of ["me", "opp"] as const) {
      if (inside(deckRect(side), x, y)) out.push(`deck:${side}`);
      if (inside(discardRect(side), x, y)) out.push(`discard:${side}`);
      for (let lane = 0; lane < 3; lane++) {
        if (inside(spellRect(side, lane), x, y)) out.push(`${side}:spell:${lane}`);
        // Defense-position cards stick out sideways a little; the lane column is a fair target.
        const mr = monsterRect(side, lane);
        if (inside({ x: LANE_X[lane]!, y: mr.y - 2, w: LANE_W, h: mr.h + 4 }, x, y)) out.push(`${side}:monster:${lane}`);
      }
      this.sigils[side].forEach((_sv, i) => {
        const c = sigilCell(side, i, this.sigils[side].length);
        if (inside({ x: c.x - 8, y: c.y - 9, w: 16, h: 18 }, x, y)) out.push(`sigil:${side}:${i}`);
      });
    }
    if (inside(sigilZone("me"), x, y)) out.push("sigils");
    if (inside(FACE, x, y)) out.push("face");
    if (inside(FIELD, x, y)) out.push("field");
    return out;
  }

  /** Where a board key sits on screen (client pixels), for HUD overlays. */
  clientRect(key: string): DOMRect | null {
    const r = rectOfKey(key);
    if (!r) return null;
    const c = this.app.canvas.getBoundingClientRect();
    return new DOMRect(c.left + r.x * this.scale, c.top + r.y * this.scale, r.w * this.scale, r.h * this.scale);
  }

  /** Where a monster's centre is, in board pixels. */
  private centre(side: Side, lane: number): { x: number; y: number } {
    const r = monsterRect(side, lane);
    return { x: r.x + CARD_W / 2, y: r.y + CARD_H / 2 };
  }

  // ---- highlights ----

  /**
   * `targets`: places a drag or choice can go (gold; red for attacks and replacing). `hot`: the one under the pointer
   * or the option being hovered (white). `focus`: the keyboard focus (white, double).
   */
  setMarks(m: { targets?: Map<string, "drop" | "attack" | "replace">; hot?: Iterable<string>; focus?: string | null }): void {
    const g = this.marks;
    g.clear();
    for (const [key, kind] of m.targets ?? []) {
      const r = rectOfKey(key);
      if (!r) continue;
      const color = kind === "drop" ? hex(UI.highlight) : hex(UI.target);
      border(g, { x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 }, color);
      g.rect(r.x, r.y, r.w, r.h).fill({ color, alpha: 0.12 });
    }
    for (const key of m.hot ?? []) {
      const r = rectOfKey(key);
      if (r) { border(g, { x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }, 0xffffff, 1, 2); g.rect(r.x, r.y, r.w, r.h).fill({ color: 0xffffff, alpha: 0.18 }); }
    }
    if (m.focus) {
      const r = rectOfKey(m.focus);
      if (r) {
        border(g, { x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 }, 0xffffff);
        border(g, { x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 }, 0xffffff);
      }
    }
  }

  /** A dotted aiming line from one of your monsters to the pointer (client coords). */
  setAim(fromLane: number | null, clientX = 0, clientY = 0, live = false): void {
    const g = this.aim;
    g.clear();
    if (fromLane === null) return;
    const a = this.centre("me", fromLane);
    const b = this.toBoard(clientX, clientY);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.floor(dist / 5);
    const color = live ? hex(UI.target) : 0xffffff;
    for (let i = 1; i < n; i++) {
      const k = i / n;
      g.rect(R(lerp(a.x, b.x, k)) - 1, R(lerp(a.y, b.y, k)) - 1, 2, 2).fill({ color: 0x1c1a24 });
      g.rect(R(lerp(a.x, b.x, k)) - 1, R(lerp(a.y, b.y, k)) - 2, 2, 2).fill({ color });
    }
    g.rect(R(b.x) - 3, R(b.y) - 3, 6, 6).fill({ color: 0x1c1a24 });
    g.rect(R(b.x) - 2, R(b.y) - 2, 4, 4).fill({ color });
  }

  // ---- tweens ----

  private tw(dur: number, step: (k: number) => void, delay = 0): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.push({ t0: performance.now() + delay * this.speed, dur: dur * this.speed, step, resolve });
    });
  }

  wait(ms: number): Promise<void> {
    return this.tw(ms, () => undefined);
  }

  // ---- static parts ----

  private drawBackground(): void {
    const table = new TilingSprite({ texture: tex(tableTileCanvas()), width: BOARD_W, height: BOARD_H });
    this.bg.addChild(table);
    const lanes = new Graphics();
    lanes.rect(FIELD.x, 0, FIELD.w, BOARD_H).fill({ color: 0x000000, alpha: 0.35 });
    this.bg.addChild(lanes);
    for (let lane = 0; lane < 3; lane++) {
      const t = new TilingSprite({ texture: tex(laneTileCanvas()), width: LANE_W - 2, height: BOARD_H - 4 });
      t.position.set(LANE_X[lane]! + 1, 2);
      this.bg.addChild(t);
    }
    const g = new Graphics();
    // The midline between the two sides.
    g.rect(FIELD.x + 2, 107, FIELD.w - 4, 1).fill({ color: 0x000000, alpha: 0.35 });
    g.rect(FIELD.x + 2, 108, FIELD.w - 4, 1).fill({ color: 0xffffff, alpha: 0.12 });
    for (const side of ["opp", "me"] as const) {
      for (let lane = 0; lane < 3; lane++) {
        dashed(g, monsterRect(side, lane), 0xffffff, 0.35);
        dashed(g, spellRect(side, lane), 0xffffff, 0.25);
      }
      // The Sigil row's mat.
      const z = sigilZone(side);
      g.rect(z.x + 2, z.y + (side === "me" ? 4 : 32), z.w - 4, side === "me" ? 68 : 68).fill({ color: 0x2a1a4a, alpha: 0.35 });
      dashed(g, discardRect(side), 0xffffff, 0.25);
    }
    this.bg.addChild(g);
    const sig = label("SIGILS", "#c9a7ff");
    sig.alpha = 0.6;
    sig.position.set(26, 202);
    const sig2 = label("SIGILS", "#c9a7ff");
    sig2.alpha = 0.6;
    sig2.position.set(26, 2);
    const you = label("YOU", UI.gold);
    you.position.set(280, 174);
    const rival = label("RIVAL", UI.gold);
    rival.position.set(280, 2);
    this.bg.addChild(sig, sig2, you, rival);
    this.piles.addChild(this.lpSprites.me, this.lpSprites.opp);
  }

  // ---- reconciling with a state ----

  private sideOf(p: PlayerId): Side {
    return p === this.me ? "me" : "opp";
  }

  private pOf(side: Side): PlayerId {
    return side === "me" ? this.me : (this.me === 0 ? 1 : 0);
  }

  /** What the sprites show right now, in the terms of core/reconcile.ts. */
  shown(): Shown {
    const out = emptyShown();
    for (const [key, v] of this.monsters) out.monsters[key] = { uid: v.uid, id: v.id, position: v.position };
    for (const [key, sv] of this.spells) out.spells[key] = { sig: sv.sig, id: sv.id };
    for (const side of ["me", "opp"] as const) out.sigils[side] = this.sigils[side].map((x) => x.tapped);
    return out;
  }

  /**
   * Bring everything in line with `s`: run the reconcile steps (fading in what's new), then settle every sprite at
   * its resting place, so nothing can stay invisible, mid-air or half-turned whatever an animation did.
   */
  sync(s: GameState, me: PlayerId): void {
    this.me = me;
    for (const o of diff(this.shown(), wanted(s, me))) {
      if (o.op === "removeMonster") this.removeMonster(o.key, "fade");
      else if (o.op === "addMonster") {
        const v = this.addMonster(o.side, o.lane, o.m.uid, o.m.id, o.m.position);
        const h = v.holder;
        h.alpha = 0;
        void this.tw(180, (k) => { h.alpha = k; });
      } else if (o.op === "turn") {
        const v = this.monsters.get(o.key)!;
        void this.turnTo(v, o.position);
      } else if (o.op === "removeSpell") {
        const sv = this.spells.get(o.key)!;
        this.spells.delete(o.key);
        const spr = sv.sprite;
        void this.tw(160, (k) => { spr.alpha = 1 - k; }).then(() => spr.destroy());
      } else if (o.op === "addSpell") {
        this.spells.get(o.key)?.sprite.destroy();
        this.addSpell(o.side, o.lane, o.sig, o.id, false);
      } else {
        const list = this.sigils[o.side];
        while (list.length > o.tapped.length) list.pop()!.sprite.destroy();
        while (list.length < o.tapped.length) {
          const spr = new Sprite(tex(sigilCardCanvas()));
          spr.anchor.set(0.5);
          const c = sigilCell(o.side, list.length, o.tapped.length);
          spr.position.set(c.x, c.y);
          this.sigilLayer.addChild(spr);
          list.push({ sprite: spr, tapped: false });
        }
        this.syncSigils(s, o.side);
      }
    }
    for (const side of ["me", "opp"] as const) {
      const p = this.pOf(side);
      const pl = s.players[p];
      for (let lane = 0; lane < 3; lane++) {
        const m = pl.monsters[lane];
        const v = this.monsters.get(`${side}:${lane}`);
        if (m && v) v.refresh(s, p, lane, m);
        const sp = pl.spells[lane];
        const sv = this.spells.get(`${side}:${lane}`);
        if (sp && sv) this.markReady(sv, side === "me" && s.active === p && sp.setTurn < s.turn && s.step === "main");
      }
      this.deckShown[side] = pl.deck.length;
      this.drawPiles(s, side);
      void this.tickLp(side, pl.lp);
    }
  }

  /** Dev check: sprites that exist but can't be seen (faded, shrunk, detached or off their slot). */
  invisible(): string[] {
    const out: string[] = [];
    for (const [key, v] of this.monsters) {
      const [side, lane] = key.split(":") as [Side, string];
      const c = this.centre(side, Number(lane));
      const h = v.holder;
      if (h.destroyed || h.alpha < 0.99 || h.scale.x < 0.99 || !h.parent || h.x !== c.x || h.y !== c.y) out.push(`monster ${key}`);
    }
    for (const [key, sv] of this.spells) if (sv.sprite.destroyed || sv.sprite.alpha < 0.99 || !sv.sprite.parent) out.push(`spell ${key}`);
    return out;
  }

  /** Every sprite at its resting place: full alpha, scale 1, centred in its slot, turned for its position. */
  settle(): void {
    for (const [key, v] of this.monsters) {
      const [side, lane] = key.split(":") as [Side, string];
      const c = this.centre(side, Number(lane));
      const h = v.holder;
      if (h.destroyed) continue;
      h.alpha = 1;
      h.scale.set(1);
      h.position.set(c.x, c.y);
      v.body.rotation = v.position === "def" ? Math.PI / 2 : 0;
      v.overlay.alpha = 1;
      if (h.parent !== this.monsterLayer) this.monsterLayer.addChild(h);
    }
    for (const [key, sv] of this.spells) {
      const [side, lane] = key.split(":") as [Side, string];
      const r = spellRect(side, Number(lane));
      if (sv.sprite.destroyed) continue;
      sv.sprite.alpha = 1;
      sv.sprite.position.set(r.x + r.w / 2, r.y + r.h / 2);
    }
    for (const side of ["me", "opp"] as const) {
      const list = this.sigils[side];
      list.forEach((sv, i) => {
        const c = sigilCell(side, i, list.length);
        sv.sprite.alpha = 1;
        sv.sprite.scale.set(1);
        sv.sprite.position.set(c.x, c.y);
        sv.sprite.rotation = sv.tapped ? Math.PI / 2 : 0;
        sv.sprite.tint = sv.tapped ? 0x8a8494 : 0xffffff;
        sv.sprite.texture = tex(sigilCardCanvas());
      });
    }
  }

  /** Tap/untap and re-lay the Sigil rows (called before an update's events too, so costs tap first). */
  syncSigils(s: GameState, side: Side): void {
    const pl = s.players[this.pOf(side)];
    const list = this.sigils[side];
    list.forEach((sv, i) => {
      const tapped = pl.sigils[i]?.tapped ?? sv.tapped;
      sv.tapped = tapped;
      const c = sigilCell(side, i, list.length);
      const spr = sv.sprite;
      const from = { x: spr.x, y: spr.y, r: spr.rotation };
      const to = { x: c.x, y: c.y, r: tapped ? Math.PI / 2 : 0 };
      if (from.x === to.x && from.y === to.y && from.r === to.r) return;
      void this.tw(200, (k) => {
        const e = ease(k);
        spr.position.set(R(lerp(from.x, to.x, e)), R(lerp(from.y, to.y, e)));
        spr.rotation = lerp(from.r, to.r, e);
        spr.tint = tapped ? 0x8a8494 : 0xffffff;
      });
    });
  }

  tapSigils(s: GameState, me: PlayerId): void {
    this.me = me;
    this.syncSigils(s, "me");
    this.syncSigils(s, "opp");
  }

  private addMonster(side: Side, lane: number, uid: number, id: string, position: "atk" | "def"): MonsterView {
    const v = new MonsterView(uid, id, side, position);
    const c = this.centre(side, lane);
    v.holder.position.set(c.x, c.y);
    this.monsterLayer.addChild(v.holder);
    this.monsters.set(`${side}:${lane}`, v);
    return v;
  }

  private removeMonster(key: string, how: "fade" | "none"): void {
    const v = this.monsters.get(key);
    if (!v) return;
    this.monsters.delete(key);
    if (how === "none") { v.holder.destroy({ children: true }); return; }
    const h = v.holder;
    void this.tw(180, (k) => { h.alpha = 1 - k; h.y = R(h.y + (k > 0 ? 0.4 : 0)); }).then(() => h.destroy({ children: true }));
  }

  private turnTo(v: MonsterView, position: "atk" | "def"): Promise<void> {
    v.position = position;
    const from = v.body.rotation, to = position === "def" ? Math.PI / 2 : 0;
    const body = v.body;
    v.overlay.alpha = 0;
    return this.tw(220, (k) => {
      body.rotation = lerp(from, to, ease(k));
      if (k >= 1) v.overlay.alpha = 1;
    });
  }

  private addSpell(side: Side, lane: number, sig: string, id: string, _ready: boolean): SpellView {
    const r = spellRect(side, lane);
    const hidden = id === "hidden";
    const spr = new Sprite(tex(hidden ? cardBackCanvas() : spellCanvas(card(id).kind)));
    spr.anchor.set(0.5);
    spr.position.set(r.x + r.w / 2, r.y + r.h / 2);
    if (hidden) spr.rotation = Math.PI / 2;
    this.spellLayer.addChild(spr);
    const sv = { sig, id, sprite: spr };
    this.spells.set(`${side}:${lane}`, sv);
    return sv;
  }

  private markReady(sv: SpellView, ready: boolean): void {
    sv.sprite.tint = ready ? 0xffffff : 0xcfc8dc;
  }

  private drawPiles(s: GameState, side: Side): void {
    const p = this.pOf(side);
    const pl = s.players[p];
    const name = `piles:${side}`;
    this.piles.getChildByLabel(name)?.destroy({ children: true });
    const c = new Container({ label: name });
    // Deck: a stack that gets lower as it empties.
    const n = this.deckShown[side];
    const d = DECK_AT[side];
    const layers = n ? Math.min(6, Math.ceil(n / 5)) : 0;
    const g = new Graphics();
    if (!n) dashed(g, deckRect(side), 0xffffff, 0.3);
    for (let i = 0; i < layers - 1; i++) {
      g.rect(d.x, d.y - i, 16, 20).fill(hex(UI.woodDark));
      g.rect(d.x + 1, d.y - i, 14, 1).fill(hex("#7a56a0"));
    }
    c.addChild(g);
    if (n) {
      const top = new Sprite(tex(cardBackCanvas()));
      top.position.set(d.x, d.y - (layers - 1));
      c.addChild(top);
    }
    const count = new Sprite(tex(digitsCanvas(String(n), UI.paper)));
    count.position.set(d.x + 18, d.y + 7);
    c.addChild(count);
    // Discard: the top card face up.
    const dr = discardRect(side);
    const topId = pl.discard[pl.discard.length - 1]?.id;
    if (topId) {
      const def = card(topId);
      const frame = new Graphics();
      const col = def.kind === "monster" ? AFFINITY[def.affinity].frame : def.kind === "ambush" ? "#8a3a4a" : def.kind === "prepared" ? "#7a6236" : "#4f6aa0";
      frame.rect(dr.x, dr.y, dr.w, dr.h).fill(hex(UI.ink));
      frame.rect(dr.x + 1, dr.y + 1, dr.w - 2, dr.h - 2).fill(hex(col));
      frame.rect(dr.x + 2, dr.y + 2, dr.w - 4, 26).fill(hex("#2a2438"));
      c.addChild(frame);
      const art = new Sprite(tex(artCanvas(topId)));
      art.position.set(dr.x + (def.kind === "monster" ? 2 : 6), dr.y + (def.kind === "monster" ? 3 : 7));
      c.addChild(art);
    }
    const dc = new Sprite(tex(digitsCanvas(String(pl.discard.length), UI.paper)));
    dc.position.set(dr.x + Math.floor((dr.w - dc.width) / 2), dr.y + dr.h + 2);
    c.addChild(dc);
    // The rival's hand: card backs.
    if (side === "opp") {
      pl.hand.forEach((_, i) => {
        const b = new Sprite(tex(tinyBackCanvas()));
        b.position.set(280 + i * Math.min(7, Math.floor(48 / Math.max(1, pl.hand.length))), 34);
        c.addChild(b);
      });
    }
    this.piles.addChild(c);
  }

  private drawLp(side: Side, lp: number): void {
    const c = this.lpSprites[side];
    c.removeChildren().forEach((x) => x.destroy());
    const color = lp <= 5 ? UI.red : UI.paper;
    const digits = new Sprite(tex(digitsCanvas(String(lp), color)));
    digits.scale.set(3);
    c.addChild(digits);
    c.position.set(LP_AT[side].x, LP_AT[side].y);
  }

  /** LP counts toward its new value, one point at a time. */
  private tickLp(side: Side, lp: number): Promise<void> {
    const from = this.lpShown[side];
    if (from === null || this.speed === 0) {
      this.lpShown[side] = lp;
      this.drawLp(side, lp);
      return Promise.resolve();
    }
    if (from === lp) return Promise.resolve();
    this.lpShown[side] = lp;
    const c = this.lpSprites[side];
    const x0 = LP_AT[side].x;
    let last = from;
    return this.tw(Math.min(600, 60 * Math.abs(lp - from)), (k) => {
      const v = R(lerp(from, lp, k));
      if (v !== last) { last = v; this.drawLp(side, v); }
      c.x = x0 + (k < 1 ? (Math.floor(k * 20) % 2 ? 1 : -1) : 0);
    });
  }

  // ---- events ----

  /** Play one event. Resolves when the next event may start. */
  async animate(e: GameEvent, next: GameState, me: PlayerId): Promise<void> {
    this.me = me;
    if (this.speed === 0) return;
    const side = "p" in e ? this.sideOf(e.p) : "me";
    switch (e.t) {
      case "draw": {
        this.deckShown[side] = Math.max(0, this.deckShown[side] - 1);
        this.drawPiles(next, side);
        const d = DECK_AT[side];
        const spr = new Sprite(tex(cardBackCanvas()));
        spr.position.set(d.x, d.y);
        this.fx.addChild(spr);
        const to = side === "me" ? { x: 160, y: BOARD_H + 4 } : { x: 290, y: 30 };
        await this.tw(240, (k) => {
          const q = ease(k);
          spr.position.set(R(lerp(d.x, to.x, q)), R(lerp(d.y, to.y, q) - 16 * Math.sin(k * Math.PI)));
          if (side === "opp") spr.alpha = 1 - k * 0.5;
        });
        spr.destroy();
        return;
      }
      case "bind": {
        const list = this.sigils[side];
        const n = list.length + 1;
        const cell = sigilCell(side, list.length, n);
        const from = side === "me" ? { x: 168, y: BOARD_H + 10 } : { x: 290, y: 38 };
        const spr = new Sprite(tex(e.card ? artCanvas(e.card) : sigilCardCanvas()));
        spr.anchor.set(0.5);
        spr.position.set(from.x, from.y);
        this.sigilLayer.addChild(spr);
        list.push({ sprite: spr, tapped: false });
        let flipped = !e.card;
        await this.tw(380, (k) => {
          const q = ease(k);
          spr.position.set(R(lerp(from.x, cell.x, q)), R(lerp(from.y, cell.y, q) - 10 * Math.sin(k * Math.PI)));
          // A flip half way: face, then face down.
          const sx = Math.abs(Math.cos(k * Math.PI));
          spr.scale.x = Math.max(0.05, sx);
          if (k >= 0.5 && !flipped) { flipped = true; spr.texture = tex(sigilCardCanvas()); }
        });
        spr.scale.x = 1;
        this.syncSigils(next, side);
        this.sparkle(cell.x, cell.y, 0xc9a7ff);
        return;
      }
      case "replace": {
        this.removeMonster(`${side}:${e.lane}`, "fade");
        await this.wait(120);
        return;
      }
      case "summon":
      case "revive": {
        const key = `${side}:${e.lane}`;
        if (this.monsters.has(key)) this.removeMonster(key, "none");
        const m = next.players[e.p].monsters[e.lane];
        const v = this.addMonster(side, e.lane, m?.uid ?? -1, e.card, e.t === "summon" ? e.position : m?.position ?? "atk");
        if (m) v.refresh(next, e.p, e.lane, m);
        const h = v.holder;
        const c = this.centre(side, e.lane);
        const fromY = side === "me" ? BOARD_H + 30 : -40;
        h.alpha = 0;
        h.scale.set(1.4);
        await this.tw(300, (k) => {
          const q = ease(k);
          h.alpha = Math.min(1, k * 2);
          h.y = R(lerp(fromY, c.y, q));
          h.scale.set(1.4 - 0.4 * q);
        });
        this.dust(c.x, c.y + (v.position === "def" ? CARD_W / 2 : CARD_H / 2));
        await this.tw(140, (k) => { h.scale.set(1 + 0.12 * Math.sin(k * Math.PI)); });
        h.scale.set(1);
        if (e.t === "summon" && e.awakened) {
          this.sparkle(c.x, c.y, 0xf6cf4a);
          this.floatText("AWAKEN", "#f6cf4a", c.x, c.y - 10);
          await this.wait(200);
        }
        return;
      }
      case "position": {
        const v = this.monsters.get(`${side}:${e.lane}`);
        if (v && v.position !== e.position) await this.turnTo(v, e.position);
        return;
      }
      case "move": {
        const a = this.monsters.get(`${side}:${e.from}`), b = this.monsters.get(`${side}:${e.to}`);
        const ca = this.centre(side, e.from), cb = this.centre(side, e.to);
        this.monsters.delete(`${side}:${e.from}`);
        this.monsters.delete(`${side}:${e.to}`);
        if (a) this.monsters.set(`${side}:${e.to}`, a);
        if (b) this.monsters.set(`${side}:${e.from}`, b);
        await this.tw(280, (k) => {
          const q = ease(k);
          if (a) a.holder.position.set(R(lerp(ca.x, cb.x, q)), R(ca.y - 6 * Math.sin(k * Math.PI)));
          if (b) b.holder.position.set(R(lerp(cb.x, ca.x, q)), R(cb.y + 6 * Math.sin(k * Math.PI)));
        });
        return;
      }
      case "set": {
        const r = spellRect(side, e.lane);
        const from = side === "me" ? { x: 168, y: BOARD_H + 10 } : { x: 290, y: 38 };
        const sp = next.players[e.p].spells[e.lane];
        const sig = sp ? (sp.id === "hidden" ? `h${sp.setTurn}` : `u${sp.uid}`) : "pending";
        this.spells.get(`${side}:${e.lane}`)?.sprite.destroy();
        const sv = this.addSpell(side, e.lane, sig, e.card ?? "hidden", false);
        const spr = sv.sprite;
        const to = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
        await this.tw(260, (k) => {
          const q = ease(k);
          spr.position.set(R(lerp(from.x, to.x, q)), R(lerp(from.y, to.y, q)));
        });
        return;
      }
      case "flip": {
        const key = `${side}:${e.lane}`;
        const sv = this.spells.get(key);
        await this.showCard(e.card, side === "me" ? "FLIP!" : "RIVAL FLIPS", "#f2c14e");
        if (sv) {
          this.spells.delete(key);
          const spr = sv.sprite;
          await this.tw(160, (k) => { spr.alpha = 1 - k; });
          spr.destroy();
        }
        return;
      }
      case "cast":
        await this.showCard(e.card, side === "me" ? "CAST" : "RIVAL CASTS", "#9fd3ff");
        return;
      case "ambush":
        await this.showCard(e.card, "AMBUSH!", UI.target);
        return;
      case "crest": {
        if (e.lane !== undefined) {
          const c = this.centre(side, e.lane);
          this.sparkle(c.x, c.y, 0xf2c14e);
        }
        this.floatText(`${e.crest.toUpperCase()} CREST`, UI.gold, 168, side === "me" ? 150 : 60);
        await this.wait(300);
        return;
      }
      case "attack": {
        const v = this.monsters.get(`${side}:${e.lane}`);
        if (!v) return;
        const h = v.holder;
        const a = this.centre(side, e.lane);
        const foe: Side = side === "me" ? "opp" : "me";
        const b = e.target.kind === "monster" ? this.centre(foe, e.target.lane)
          : { x: a.x, y: side === "me" ? 4 : BOARD_H - 4 };
        const back = { x: a.x - (b.x - a.x) * 0.08, y: a.y - (b.y - a.y) * 0.08 };
        this.monsterLayer.addChild(h); // on top
        await this.tw(120, (k) => { h.position.set(R(lerp(a.x, back.x, ease(k))), R(lerp(a.y, back.y, ease(k)))); });
        await this.tw(110, (k) => { h.position.set(R(lerp(back.x, lerp(a.x, b.x, 0.6), k * k)), R(lerp(back.y, lerp(a.y, b.y, 0.6), k * k))); });
        this.impact(R(lerp(a.x, b.x, 0.75)), R(lerp(a.y, b.y, 0.75)));
        void this.tw(200, (k) => { h.position.set(R(lerp(lerp(a.x, b.x, 0.6), a.x, ease(k))), R(lerp(lerp(a.y, b.y, 0.6), a.y, ease(k)))); });
        await this.wait(60);
        return;
      }
      case "damage": {
        const v = this.monsters.get(`${side}:${e.lane}`);
        const c = this.centre(side, e.lane);
        this.floatText(`-${e.amount}`, UI.target, c.x, c.y - 6, true);
        if (v) await this.shake(v.holder, c.x);
        return;
      }
      case "destroyed": {
        const key = `${side}:${e.lane}`;
        const v = this.monsters.get(key);
        if (!v) return;
        this.monsters.delete(key);
        const h = v.holder;
        await this.tw(140, (k) => {
          v.art.tint = Math.floor(k * 6) % 2 ? 0xffffff : 0xff7766;
          h.alpha = 1;
        });
        this.shatter(h.x, h.y, card(e.card).affinity);
        h.destroy({ children: true });
        await this.wait(200);
        return;
      }
      case "bounce": {
        const key = `${side}:${e.lane}`;
        const v = this.monsters.get(key);
        if (!v) return;
        this.monsters.delete(key);
        const h = v.holder;
        const y0 = h.y, y1 = side === "me" ? BOARD_H + 40 : -50;
        await this.tw(300, (k) => { h.y = R(lerp(y0, y1, k * k)); h.alpha = 1 - k * 0.6; h.scale.set(1 - 0.3 * k); });
        h.destroy({ children: true });
        return;
      }
      case "buff": {
        const c = this.centre(side, e.lane);
        const parts = [e.atk ? `${e.atk > 0 ? "+" : ""}${e.atk}` : "", e.def ? `${e.def > 0 ? "+" : ""}${e.def}` : ""].filter(Boolean);
        this.floatText(parts.join(" "), e.atk ? "#ffb35c" : "#9fd3ff", c.x, c.y - 4, true);
        const v = this.monsters.get(`${side}:${e.lane}`);
        const m = next.players[e.p].monsters[e.lane];
        if (v && m) v.refresh(next, e.p, e.lane, m);
        await this.wait(160);
        return;
      }
      case "lp": {
        const at = LP_AT[side];
        this.floatText(`${e.delta > 0 ? "+" : ""}${e.delta}`, e.delta < 0 ? UI.red : UI.green, at.x + 20, at.y + (side === "me" ? -10 : 24), true);
        await this.tickLp(side, e.lp);
        return;
      }
      case "cancelled": {
        const c = this.centre(side, e.lane);
        this.floatText("CANCELLED", UI.paper, c.x, c.y);
        await this.wait(300);
        return;
      }
      case "emptyDeck": {
        this.floatText("DECK EMPTY", UI.red, 40, side === "me" ? 180 : 40);
        await this.wait(250);
        return;
      }
      default:
        return;
    }
  }

  // ---- effects ----

  private shake(h: Container, x0: number): Promise<void> {
    return this.tw(260, (k) => { h.x = x0 + (k < 1 ? R(Math.sin(k * 40) * 3 * (1 - k)) : 0); });
  }

  private floatText(text: string, color: string, x: number, y: number, digits = false): void {
    const isDigits = digits && /^[-+0-9 /]+$/.test(text);
    const obj: Container = isDigits ? new Sprite(tex(digitsCanvas(text.replace(/ /g, ""), color))) : label(text, color);
    if (isDigits) obj.scale.set(2);
    obj.position.set(R(x - obj.width / 2), R(y));
    this.fx.addChild(obj);
    const y0 = obj.y;
    void this.tw(900, (k) => {
      obj.y = R(y0 - 14 * ease(k));
      obj.alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    }).then(() => obj.destroy());
  }

  private particles(x: number, y: number, colors: number[], n: number, spread: number, life: number, gravity: number): void {
    for (let i = 0; i < n; i++) {
      const g = new Graphics().rect(0, 0, 2, 2).fill(colors[i % colors.length]!);
      const ang = (i / n) * Math.PI * 2 + (i % 3) * 0.4;
      const sp = spread * (0.5 + ((i * 37) % 10) / 20);
      const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp - spread * 0.4;
      g.position.set(x, y);
      this.fx.addChild(g);
      void this.tw(life, (k) => {
        g.position.set(R(x + vx * k), R(y + vy * k + gravity * k * k));
        g.alpha = 1 - k;
      }).then(() => g.destroy());
    }
  }

  private dust(x: number, y: number): void {
    this.particles(x, y, [0xd9c49a, 0xb59c66, 0xf4e8c8], 10, 16, 380, 6);
  }

  private sparkle(x: number, y: number, color: number): void {
    this.particles(x, y, [color, 0xffffff], 12, 20, 500, -4);
  }

  private impact(x: number, y: number): void {
    this.particles(x, y, [0xffffff, 0xffe66d, 0xff6b5b], 10, 14, 260, 0);
  }

  private shatter(x: number, y: number, affinity: keyof typeof AFFINITY): void {
    const pal = AFFINITY[affinity];
    const colors = [hex(pal.frame), hex(pal.frameDark), hex(pal.body[2]), hex(pal.body[3])];
    for (let i = 0; i < 16; i++) {
      const w = 4 + (i % 3) * 2;
      const g = new Graphics().rect(-w / 2, -w / 2, w, w).fill(colors[i % colors.length]!);
      const cx = x + ((i % 4) - 1.5) * 12, cy = y + (Math.floor(i / 4) - 1.5) * 14;
      g.position.set(R(cx), R(cy));
      this.fx.addChild(g);
      const vx = (cx - x) * 1.2, vy = (cy - y) * 0.8 - 10;
      void this.tw(520, (k) => {
        g.position.set(R(cx + vx * k), R(cy + vy * k + 30 * k * k));
        g.alpha = 1 - k;
      }).then(() => g.destroy());
    }
  }

  /** A card shown big over the board for a moment (casts, flips, Ambushes). */
  private async showCard(id: string, title: string, color: string): Promise<void> {
    const c = new Container();
    const def = card(id);
    const g = new Graphics();
    g.rect(-40, -34, 80, 68).fill(hex(UI.ink));
    g.rect(-39, -33, 78, 66).fill(hex(def.kind === "ambush" ? "#8a3a4a" : def.kind === "prepared" ? "#7a6236" : "#4f6aa0"));
    g.rect(-36, -22, 72, 38).fill(hex("#2a2438"));
    c.addChild(g);
    const art = new Sprite(tex(spellCanvas(def.kind)));
    art.scale.set(2);
    art.position.set(-16, -19);
    const t = label(title, color);
    t.position.set(R(-t.width / 2), -32);
    const n = label(def.name.toUpperCase(), UI.paper);
    n.position.set(R(-n.width / 2), 19);
    c.addChild(art, t, n);
    c.position.set(176, 108);
    this.fx.addChild(c);
    c.alpha = 0;
    await this.tw(160, (k) => { c.alpha = k; c.scale.set(0.6 + 0.4 * ease(k)); });
    await this.wait(480);
    await this.tw(160, (k) => { c.alpha = 1 - k; });
    c.destroy({ children: true });
  }

  /** Throw away every display object (a new duel). */
  reset(): void {
    for (const key of [...this.monsters.keys()]) this.removeMonster(key, "none");
    for (const sv of this.spells.values()) sv.sprite.destroy();
    this.spells.clear();
    for (const side of ["me", "opp"] as const) {
      for (const sv of this.sigils[side]) sv.sprite.destroy();
      this.sigils[side] = [];
      this.lpShown[side] = null;
    }
    this.fx.removeChildren().forEach((c) => c.destroy({ children: true }));
  }
}

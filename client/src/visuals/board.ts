/**
 * The board (a playmat), drawn with Pixi at a small fixed resolution (BOARD_W × BOARD_H) and scaled up by a whole
 * number with `image-rendering: pixelated`, so every art pixel is a crisp square.
 *
 * Display objects persist between updates (keyed by side and lane), so changes animate instead of snapping:
 * `animate(event)` plays one server event, and `sync(state)` tweens whatever is left over into place. Pixi only
 * draws; the controller decides what pointer input means, using `keysAt` and the server's legal actions.
 */
import { Application, Container, Graphics, RenderLayer, Sprite, Text, Texture, TextureSource } from "pixi.js";
import {
  atkOf, card, defOf, hasLeap, isGuarding, type GameEvent, type GameState, type Monster, type PlayerId,
} from "@sigilbound/engine";
import { diff, emptyShown, wanted, type Shown } from "../core/reconcile.js";
import { digitsCanvas } from "../gfx/digits.js";
import { boardBackgroundCanvas } from "../gfx/board-art.js";
import { PostFx } from "./shaders/index.js";
import { lightFlash, type Light } from "./shaders/lights.js";
import { AFFINITY, PAL, UI } from "../gfx/palette.js";
import {
  badgeCanvas, cardBackCanvas, cardCanvas, monsterCanvas, monsterFlash, monsterPose, sigilCardCanvas, spellCanvas, tinyBackCanvas,
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
const REVEAL_AT = { x: 40, y: 100 };

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
/** Ease out with a little overshoot (pops, landings). */
const overshoot = (k: number) => { const c = 1.7; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; };
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
/** The idle loop: frame per time in a 1.2 s breath (hold, in, hold, out). */
const IDLE_MS = 1200;
function idleFrame(t: number): string {
  const q = t % IDLE_MS;
  return q < 380 ? "idle0" : q < 560 ? "idle1" : q < 960 ? "idle2" : "idle3";
}
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
  if (key === "center") return { x: BOARD_W / 2 - 1, y: BOARD_H / 2 - 1, w: 2, h: 2 };
  // Where the rival's revealed card holds: over the Sigil column, so the lanes it hits stay in view.
  if (key === "revealAt") return { x: REVEAL_AT.x - 1, y: REVEAL_AT.y - 1, w: 2, h: 2 };
  if (key === "hand:opp") return { x: 280, y: 32, w: 50, h: 12 };
  if (key === "hand:me") return { x: 120, y: BOARD_H - 2, w: 96, h: 2 };
  if (a === "sigils") return sigilZone(b as Side);
  if (a === "lp") return { ...LP_AT[b as Side], w: 36, h: 21 };
  if (a === "deck") return deckRect(b as Side);
  if (a === "discard") return discardRect(b as Side);
  if (b === "monster") return monsterRect(a as Side, Number(c));
  if (b === "spell") return spellRect(a as Side, Number(c));
  return null;
}

const inside = (r: Rect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

/** Numbers and badges render here, after the shader passes, so they stay sharp (see visuals/shaders). */
let labelLayer: RenderLayer | null = null;

interface Tween { t0: number; dur: number; step(k: number): void; resolve(): void }

class MonsterView {
  readonly holder = new Container();
  readonly body = new Container();
  readonly art: Sprite;
  readonly shadow: Graphics;
  readonly artY: number;
  readonly overlay = new Container();
  position: "atk" | "def";
  /** Keyword badges drawn on the card, with their spot relative to the holder (for hover tooltips). */
  badges: { kw: string; x: number; y: number }[] = [];
  /** An action pose held over the idle loop ("attack", "hit", "flash"), or null to breathe. */
  pose: string | null = null;
  private shownFrame = "idle0";
  setFrame(name: string): void {
    if (name === this.shownFrame || this.art.destroyed) return;
    this.shownFrame = name;
    this.art.texture = tex(name === "flash" ? monsterFlash(this.id) : monsterPose(this.id, name));
  }
  constructor(readonly uid: number, readonly id: string, readonly side: Side, position: "atk" | "def") {
    // A soft drop shadow toward the bottom right (the light is top left); it turns with the card.
    this.shadow = new Graphics();
    this.shadow.rect(-CARD_W / 2 + 2, -CARD_H / 2 + 3, CARD_W, CARD_H).fill({ color: hex(PAL.ink), alpha: 0.35 });
    this.shadow.rect(-CARD_W / 2 + 1, -CARD_H / 2 + 2, CARD_W, CARD_H).fill({ color: hex(PAL.ink), alpha: 0.25 });
    const frame = new Sprite(tex(cardCanvas(id, "board")));
    frame.position.set(-CARD_W / 2, -CARD_H / 2);
    this.body.addChild(frame);
    this.art = new Sprite(tex(monsterCanvas(id)));
    this.art.scale.set(side === "opp" ? -1 : 1, 1);
    this.artY = -CARD_H / 2 + 6;
    this.art.position.set(side === "opp" ? 24 : -24, this.artY);
    this.body.addChild(this.art);
    this.position = position;
    this.body.rotation = position === "def" ? Math.PI / 2 : 0;
    this.holder.addChild(this.shadow, this.body, this.overlay);
    labelLayer?.attach(this.overlay);
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
    this.badges = [];
    badges.forEach((b, i) => {
      const bs = new Sprite(tex(badgeCanvas(b)));
      const top = m.position === "def" ? -CARD_W / 2 : -CARD_H / 2;
      const right = m.position === "def" ? CARD_H / 2 : CARD_W / 2;
      bs.position.set(right - 8 - i * 8, top + 1);
      this.badges.push({ kw: b, x: right - 8 - i * 8, y: top + 1 });
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
  private readonly world = new Container();
  private readonly scene = new Container();
  private readonly labels = new RenderLayer();
  private readonly post: PostFx;
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
  /** Whose turn it is (a pulsing gold frame on that side's LP plaque), and its graphics. */
  private activeSide: Side | null = null;
  private readonly turnMark = new Graphics();
  private readonly lpFlash: Record<Side, Graphics> = { me: new Graphics(), opp: new Graphics() };
  private frozenUntil = 0;
  private shakeUntil = 0;
  private shakeAmp = 0;
  private shakeDur = 1;
  /** 1 = normal speed; smaller is faster; 0 = instant. */
  speed = 1;
  private me: PlayerId = 0;

  private constructor(private readonly app: Application) {
    labelLayer = this.labels;
    this.world.addChild(this.bg, this.piles, this.sigilLayer, this.spellLayer, this.monsterLayer);
    this.scene.addChild(this.world, this.marks, this.aim, this.fx);
    app.stage.addChild(this.scene, this.labels);
    this.drawBackground();
    this.labels.attach(this.lpSprites.me, this.lpSprites.opp);
    this.post = new PostFx(app, { world: this.world, scene: this.scene, casters: [this.piles, this.sigilLayer, this.spellLayer, this.monsterLayer] },
      () => this.lights());
    app.ticker.add((t) => {
      this.time += t.deltaMS;
      const now = performance.now();
      // Screen shake: whole board pixels only, so the art stays on the pixel grid.
      if (now < this.shakeUntil) {
        const a = Math.ceil(this.shakeAmp * (this.shakeUntil - now) / this.shakeDur);
        const ph = Math.floor(now / 33);
        app.stage.position.set(ph % 2 ? a : -a, ph % 3 === 0 ? -Math.min(1, a) : 0);
      } else if (app.stage.x || app.stage.y) app.stage.position.set(0, 0);
      // Hit-stop: tweens hold still for a beat on a big hit.
      if (now < this.frozenUntil) { this.post.update(t.deltaMS); return; }
      const keep: Tween[] = [];
      for (const tw of this.tweens) {
        if (now < tw.t0) { keep.push(tw); continue; }
        const k = tw.dur <= 0 ? 1 : Math.min(1, (now - tw.t0) / tw.dur);
        try { tw.step(k); } catch { /* the object went away mid-tween */ }
        if (k >= 1) tw.resolve();
        else keep.push(tw);
      }
      this.tweens = keep;
      // Idle: monsters breathe through their 4 idle frames (out of step with each other) unless an action pose
      // is held; shadows turn with their cards.
      for (const v of this.monsters.values()) {
        if (v.holder.destroyed) continue;
        v.shadow.rotation = v.body.rotation;
        v.setFrame(v.pose ?? idleFrame(this.time + v.uid * 377));
      }
      this.drawTurnMark();
      this.marks.alpha = 0.7 + 0.3 * Math.sin(this.time / 160);
      this.post.update(t.deltaMS);
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

  /** Smoothed frame rate (the shader layer measures it). */
  get fps(): number {
    return this.post.fps;
  }

  /**
   * Steady lights for the shader layer: monsters glow by affinity (Ember warm, Tide cool, faint Stone and Gale),
   * untapped Sigils faintly. Only public things give off light, so it never hints at hidden cards.
   */
  private lights(): Light[] {
    const out: Light[] = [];
    const flicker = 0.9 + 0.1 * Math.sin(this.time / 90) * Math.sin(this.time / 37);
    for (const v of this.monsters.values()) {
      const h = v.holder;
      if (h.destroyed || h.alpha < 0.05) continue;
      const aff = card(v.id).affinity;
      // Lights sit at the card's lower edge, so they spill onto the felt around it rather than bleaching the art.
      const glow = aff === "fire" ? { color: hex(PAL.fire4), radius: 50, intensity: 0.6 * flicker }
        : aff === "water" ? { color: hex(PAL.tide3), radius: 44, intensity: 0.42 }
          : aff === "earth" ? { color: hex(PAL.moss3), radius: 34, intensity: 0.26 }
            : { color: hex(PAL.gale3), radius: 38, intensity: 0.3 };
      out.push({ x: h.x, y: h.y + 26, ...glow, intensity: glow.intensity * h.alpha });
    }
    for (const side of ["me", "opp"] as const) {
      for (const sv of this.sigils[side]) {
        if (sv.tapped || sv.sprite.destroyed) continue;
        out.push({ x: sv.sprite.x, y: sv.sprite.y, color: hex(PAL.arc3), radius: 16, intensity: 0.55 });
      }
    }
    return out.slice(0, 12);
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

  /**
   * The key among `keys` nearest a client point, if its place is within `slack` board pixels: drops and clicks that
   * miss a slot by a little still land. Exact hits always win (distance 0).
   */
  nearest(keys: Iterable<string>, clientX: number, clientY: number, slack = 14): string | null {
    const { x, y } = this.toBoard(clientX, clientY);
    let best: string | null = null, bestD = Infinity;
    for (const key of keys) {
      const r = rectOfKey(key);
      if (!r || key === "field") continue;
      const dx = Math.max(r.x - x, 0, x - (r.x + r.w)), dy = Math.max(r.y - y, 0, y - (r.y + r.h));
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = key; }
    }
    return bestD <= slack ? best : null;
  }

  /** The keyword badge under a client point (a monster's Guard/Leap/Rush/Awaken mark), if any. */
  badgeAt(clientX: number, clientY: number): { key: string; kw: string } | null {
    const { x, y } = this.toBoard(clientX, clientY);
    for (const [key, v] of this.monsters) {
      const h = v.holder;
      for (const b of v.badges) {
        const bx = h.x + b.x, by = h.y + b.y;
        if (x >= bx - 1 && x < bx + 8 && y >= by - 1 && y < by + 8) {
          const [side, lane] = key.split(":");
          return { key: `${side}:monster:${lane}`, kw: b.kw };
        }
      }
    }
    return null;
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

  /**
   * Light for a rival card revealed by the HUD (which replaces showCard's own flash). Face-down plays pass "hidden"
   * and give off no light, so the shader layer never hints at what they are.
   */
  revealLight(id: string): void {
    if (id === "hidden") return;
    const def = card(id);
    const color = def.kind === "monster" ? AFFINITY[def.affinity].accentGlow : PAL.arc3;
    lightFlash(REVEAL_AT.x, REVEAL_AT.y, hex(color), 80, 700);
  }

  /** Pixel beams from where a revealed card holds to each target. Returns a function that clears them. */
  beam(keys: string[], color = UI.target): () => void {
    const g = new Graphics();
    this.fx.addChild(g);
    const from = REVEAL_AT;
    const ends = keys.map((k) => rectOfKey(k)).filter((r): r is Rect => !!r);
    const col = hex(color);
    let gone = false;
    const draw = (k: number) => {
      if (gone) return;
      g.clear();
      for (const r of ends) {
        const to = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        const n = Math.max(1, Math.floor((dist * k) / 4));
        for (let i = 1; i <= n; i++) {
          const q = (i * 4) / dist;
          if (q > 1) break;
          const px = R(lerp(from.x, to.x, q)), py = R(lerp(from.y, to.y, q));
          g.rect(px - 1, py - 1, 3, 3).fill({ color: 0x1c1a24 });
          g.rect(px - 1, py - 2, 3, 3).fill({ color: col });
        }
        if (k >= 1) {
          border(g, { x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }, col, 1, 2);
          g.rect(r.x, r.y, r.w, r.h).fill({ color: col, alpha: 0.18 });
        }
      }
    };
    void this.tw(240, (k) => draw(ease(k))).then(() => {
      if (!gone) for (const r of ends) lightFlash(r.x + r.w / 2, r.y + r.h / 2, col, 36, 420, 1.1);
    });
    return () => {
      if (gone) return;
      gone = true;
      void this.tw(160, (k) => { g.alpha = 1 - k; }).then(() => g.destroy());
    };
  }

  // ---- tweens ----

  private tw(dur: number, step: (k: number) => void, delay = 0): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.push({ t0: performance.now() + delay * this.speed, dur: dur * this.speed, step, resolve });
    });
  }

  /** Finish every running animation now (skipping the rival's move). */
  flush(): void {
    const all = this.tweens;
    this.tweens = [];
    for (const tw of all) {
      try { tw.step(1); } catch { /* gone */ }
      tw.resolve();
    }
  }

  wait(ms: number): Promise<void> {
    return this.tw(ms, () => undefined);
  }

  // ---- static parts ----

  private drawBackground(): void {
    const sides = ["opp", "me"] as const;
    const lanes = [0, 1, 2];
    this.bg.addChild(new Sprite(tex(boardBackgroundCanvas({
      w: BOARD_W, h: BOARD_H, field: FIELD,
      lanes: LANE_X.map((x) => ({ x, y: 0, w: LANE_W, h: BOARD_H })),
      monsterSlots: sides.flatMap((side) => lanes.map((l) => monsterRect(side, l))),
      spellSlots: sides.flatMap((side) => lanes.map((l) => spellRect(side, l))),
      sigilMats: sides.map((side) => { const z = sigilZone(side); return { x: z.x + 2, y: z.y + (side === "me" ? 4 : 32), w: z.w - 4, h: 68 }; }),
      decks: sides.map(deckRect),
      discards: sides.map(discardRect),
      plaques: sides.map((side) => ({ x: LP_AT[side].x - 3, y: LP_AT[side].y - 3, w: 52, h: 27 })),
    }))));
    const sig = label("SIGILS", PAL.arc3);
    sig.alpha = 0.6;
    sig.position.set(26, 202);
    const sig2 = label("SIGILS", PAL.arc3);
    sig2.alpha = 0.6;
    sig2.position.set(26, 2);
    const you = label("YOU", UI.gold);
    you.position.set(280, 174);
    const rival = label("RIVAL", UI.gold);
    rival.position.set(280, 2);
    this.bg.addChild(sig, sig2, you, rival);
    this.labels.attach(sig, sig2, you, rival);
    this.piles.addChild(this.lpFlash.me, this.lpFlash.opp, this.lpSprites.me, this.lpSprites.opp);
    this.scene.addChild(this.turnMark);
  }

  /** A gold frame that breathes around the LP plaque of whoever's turn it is. */
  private drawTurnMark(): void {
    const g = this.turnMark;
    g.clear();
    const side = this.activeSide;
    if (!side) return;
    const at = LP_AT[side];
    const r = { x: at.x - 5, y: at.y - 5, w: 56, h: 31 };
    const on = Math.floor(this.time / 450) % 2 === 0;
    border(g, r, hex(UI.gold), on ? 1 : 0.6);
    border(g, { x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 }, hex(PAL.ink), 0.6);
  }

  /** Whose turn it is now (the controller calls this as the turn banner starts, so the two agree). */
  markTurn(p: PlayerId | null): void {
    this.activeSide = p === null ? null : this.sideOf(p);
  }

  /** Big hits: hold every tween still for a moment and/or shake the board a pixel or two. */
  private impactFeel(stopMs: number, shakePx: number, shakeMs = 220): void {
    if (this.speed === 0) return;
    const now = performance.now();
    if (stopMs > 0 && this.speed >= 0.9) {
      for (const tw of this.tweens) tw.t0 += stopMs;
      this.frozenUntil = Math.max(this.frozenUntil, now + stopMs);
    }
    if (shakePx > 0) { this.shakeUntil = now + shakeMs; this.shakeAmp = shakePx; this.shakeDur = shakeMs; }
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
    this.activeSide = s.step === "over" || s.step === "mulligan" ? null : this.sideOf(s.active);
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
      v.pose = null;
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
      g.rect(d.x, d.y - i, 16, 20).fill(hex(PAL.ink));
      g.rect(d.x + 1, d.y - i, 14, 1).fill(hex(i % 2 ? PAL.plum : PAL.mauve));
    }
    c.addChild(g);
    if (n) {
      const top = new Sprite(tex(cardBackCanvas()));
      top.position.set(d.x, d.y - (layers - 1));
      c.addChild(top);
    }
    const count = new Sprite(tex(digitsCanvas(String(n), UI.paper)));
    this.labels.attach(count);
    count.position.set(d.x + 18, d.y + 7);
    c.addChild(count);
    // Discard: the top card face up.
    const dr = discardRect(side);
    const topId = pl.discard[pl.discard.length - 1]?.id;
    // Cards under the top one peek out, a pixel lower and to the right each, so a thick pile looks thick.
    const under = Math.min(3, Math.max(0, pl.discard.length - 1));
    if (under) {
      const sg = new Graphics();
      for (let i = under; i >= 1; i--) {
        sg.rect(dr.x + i, dr.y + i, dr.w, dr.h).fill(hex(PAL.ink));
        sg.rect(dr.x + i, dr.y + i, dr.w - 1, dr.h - 1).fill(hex(i % 2 ? PAL.paper3 : PAL.paper4));
      }
      c.addChild(sg);
    }
    if (topId) {
      const top = new Sprite(tex(cardCanvas(topId, "pile")));
      top.position.set(dr.x, dr.y);
      c.addChild(top);
    }
    const dc = new Sprite(tex(digitsCanvas(String(pl.discard.length), UI.paper)));
    this.labels.attach(dc);
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
    const loss = lp < from;
    let last = from;
    // The plaque flashes red (loss) or green (gain) and fades; big losses shake the board.
    const fl = this.lpFlash[side];
    const at = LP_AT[side];
    fl.clear().rect(at.x - 3, at.y - 3, 52, 27).fill({ color: hex(loss ? UI.red : UI.green) });
    fl.alpha = 0.55;
    if (loss && from - lp >= 3) this.impactFeel(0, from - lp >= 5 ? 2 : 1, 260);
    void this.tw(520, (k) => { fl.alpha = 0.55 * (1 - ease(k)); });
    return this.tw(Math.min(640, 70 * Math.abs(lp - from)), (k) => {
      const v = R(lerp(from, lp, ease(k)));
      if (v !== last) { last = v; this.drawLp(side, v); }
      c.x = x0 + (loss && k < 1 ? (Math.floor(k * 20) % 2 ? 1 : -1) : 0);
    });
  }

  // ---- events ----

  /** Play one event. Resolves when the next event may start. */
  async animate(e: GameEvent, next: GameState, me: PlayerId, revealed = false): Promise<void> {
    this.me = me;
    if (this.speed === 0) return;
    const side = "p" in e ? this.sideOf(e.p) : "me";
    switch (e.t) {
      case "turn":
        this.activeSide = side;
        return;
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
        const spr = new Sprite(tex(e.card ? cardCanvas(e.card, "tiny") : sigilCardCanvas()));
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
        if (!revealed) await this.showCard(e.card, side === "me" ? "FLIP!" : "RIVAL FLIPS", "#f2c14e");
        if (sv) {
          this.spells.delete(key);
          const spr = sv.sprite;
          await this.tw(160, (k) => { spr.alpha = 1 - k; });
          spr.destroy();
        }
        return;
      }
      case "cast":
        if (!revealed) await this.showCard(e.card, side === "me" ? "CAST" : "RIVAL CASTS", "#9fd3ff");
        return;
      case "ambush":
        if (!revealed) await this.showCard(e.card, "AMBUSH!", UI.target);
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
        v.pose = "attack";
        // Wind up (eased), lunge (accelerating), impact, then settle home with a small overshoot.
        await this.tw(140, (k) => { h.position.set(R(lerp(a.x, back.x, easeInOut(k))), R(lerp(a.y, back.y, easeInOut(k)))); });
        const hitAt = { x: lerp(a.x, b.x, 0.6), y: lerp(a.y, b.y, 0.6) };
        await this.tw(100, (k) => { h.position.set(R(lerp(back.x, hitAt.x, k * k * k)), R(lerp(back.y, hitAt.y, k * k * k))); });
        this.impact(R(lerp(a.x, b.x, 0.75)), R(lerp(a.y, b.y, 0.75)));
        this.impactFeel(50, e.target.kind === "monster" ? 1 : 2, 180);
        void this.tw(240, (k) => {
          h.position.set(R(lerp(hitAt.x, a.x, overshoot(k))), R(lerp(hitAt.y, a.y, overshoot(k))));
          if (k > 0.5 && !h.destroyed) v.pose = null;
        });
        await this.wait(70);
        return;
      }
      case "damage": {
        const v = this.monsters.get(`${side}:${e.lane}`);
        const c = this.centre(side, e.lane);
        this.floatText(`-${e.amount}`, UI.target, c.x, c.y - 6, true);
        if (e.amount >= 3) this.impactFeel(60, 1, 160);
        if (v) {
          v.pose = "flash";
          void this.wait(70).then(() => { if (v.pose === "flash") v.pose = "hit"; });
          await this.shake(v.holder, c.x);
          if (v.pose === "hit" || v.pose === "flash") v.pose = null;
        }
        return;
      }
      case "destroyed": {
        const key = `${side}:${e.lane}`;
        const v = this.monsters.get(key);
        if (!v) return;
        this.monsters.delete(key);
        const h = v.holder;
        v.pose = "hit";
        // Flicker hit/white, swell a touch, then burst.
        await this.tw(180, (k) => {
          v.pose = Math.floor(k * 6) % 2 ? "flash" : "hit";
          h.scale.set(1 + 0.06 * ease(k));
          h.alpha = 1;
        });
        this.impactFeel(80, 2, 240);
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
    const w2 = obj.width / 2;
    obj.position.set(R(x - w2), R(y));
    this.fx.addChild(obj);
    const y0 = obj.y;
    // Numbers pop in one size bigger (whole-pixel scales only), then rise and fade.
    if (isDigits) obj.scale.set(3);
    void this.tw(900, (k) => {
      if (isDigits) {
        const s = k < 0.12 ? 3 : 2;
        if (obj.scale.x !== s) obj.scale.set(s);
        obj.x = R(x - (obj.width / 2));
      }
      obj.y = R(y0 - 14 * ease(k));
      obj.alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    }).then(() => obj.destroy());
  }

  /**
   * Pixel particles. `shape` picks the sprite: square chips, puffs that swell and thin out, spark streaks that
   * point along their flight, or 4-point twinkles. All colours come from the palette.
   */
  private particles(x: number, y: number, colors: number[], n: number, spread: number, life: number, gravity: number,
    shape: "chip" | "puff" | "spark" | "twinkle" = "chip"): void {
    for (let i = 0; i < n; i++) {
      const col = colors[i % colors.length]!;
      const ang = (i / n) * Math.PI * 2 + (i % 3) * 0.4;
      const sp = spread * (0.5 + ((i * 37) % 10) / 20);
      const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp - spread * 0.4;
      const g = new Graphics();
      if (shape === "puff") g.rect(-1, -1, 3, 2).fill(col).rect(0, -2, 1, 1).fill(col);
      else if (shape === "spark") {
        const len = 2 + (i % 2);
        if (Math.abs(vx) > Math.abs(vy)) g.rect(0, 0, len, 1).fill(col); else g.rect(0, 0, 1, len).fill(col);
      } else if (shape === "twinkle") g.rect(0, -1, 1, 3).fill(col).rect(-1, 0, 3, 1).fill(col).rect(0, 0, 1, 1).fill(0xffffff);
      else g.rect(0, 0, 2, 2).fill(col);
      g.position.set(x, y);
      this.fx.addChild(g);
      const life2 = life * (0.8 + ((i * 53) % 10) / 25);
      void this.tw(life2, (k) => {
        g.position.set(R(x + vx * k), R(y + vy * k + gravity * k * k));
        g.alpha = k < 0.5 ? 1 : 1 - (k - 0.5) * 2;
        if (shape === "puff") g.scale.set(1 + k * 0.8);
        if (shape === "twinkle") g.visible = k < 0.7 || Math.floor(k * 20) % 2 === 0;
      }).then(() => g.destroy());
    }
  }

  private dust(x: number, y: number): void {
    this.particles(x, y, [hex(PAL.paper3), hex(PAL.paper2), hex(PAL.paper4)], 12, 18, 420, 4, "puff");
    this.particles(x, y, [hex(PAL.moss3), hex(PAL.paper4)], 6, 10, 300, 10, "chip");
    lightFlash(x, y - 10, hex(PAL.paper2), 40, 260);
  }

  private sparkle(x: number, y: number, color: number): void {
    this.particles(x, y, [color, hex(PAL.white)], 10, 20, 560, -4, "twinkle");
    lightFlash(x, y, color, 48, 420);
  }

  private impact(x: number, y: number): void {
    this.particles(x, y, [hex(PAL.white), hex(PAL.gold4), hex(PAL.fire4), hex(PAL.fire3)], 14, 22, 320, 14, "spark");
    this.particles(x, y, [hex(PAL.gold3)], 4, 8, 200, 0, "twinkle");
    lightFlash(x, y, hex(PAL.fire4), 56, 220);
  }

  private shatter(x: number, y: number, affinity: keyof typeof AFFINITY): void {
    const pal = AFFINITY[affinity];
    const colors = [hex(pal.frame), hex(pal.frameDark), hex(pal.body[2]), hex(pal.body[3]), hex(pal.frameLight)];
    lightFlash(x, y, hex(pal.accentGlow), 64, 360);
    for (let i = 0; i < 18; i++) {
      const w = 3 + (i % 3) * 2;
      // Triangular shards with a lit edge.
      const g = new Graphics().poly([-w / 2, -w / 2, w / 2, -w / 2 + (i % 2), -w / 2 + (i % 3), w / 2]).fill(colors[i % colors.length]!)
        .rect(-w / 2, -w / 2, w - 1, 1).fill(hex(pal.frameLight));
      const cx = x + ((i % 4) - 1.5) * 12, cy = y + (Math.floor(i / 4) - 1.5) * 14;
      g.position.set(R(cx), R(cy));
      this.fx.addChild(g);
      const vx = (cx - x) * 1.2, vy = (cy - y) * 0.8 - 12;
      const spin = ((i % 5) - 2) * 1.6;
      void this.tw(560, (k) => {
        g.position.set(R(cx + vx * k), R(cy + vy * k + 34 * k * k));
        g.rotation = Math.round((spin * k) / (Math.PI / 4)) * (Math.PI / 4);
        g.alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      }).then(() => g.destroy());
    }
    this.particles(x, y, [hex(pal.accentGlow), hex(PAL.white)], 8, 18, 380, 6, "spark");
  }

  /** A card shown big over the board for a moment (casts, flips, Ambushes). */
  private async showCard(id: string, title: string, color: string): Promise<void> {
    const c = new Container();
    const def = card(id);
    const face = new Sprite(tex(cardCanvas(id, "show")));
    face.position.set(-32, -41);
    const shadow = new Graphics().rect(-30, -38, 64, 82).fill({ color: hex(PAL.ink), alpha: 0.45 });
    const t = label(title, color);
    t.position.set(R(-t.width / 2), -53);
    const n = label(def.name.toUpperCase(), UI.paper);
    n.position.set(R(-n.width / 2), -40);
    c.addChild(shadow, face, n, t);
    c.position.set(176, 108);
    this.fx.addChild(c);
    c.alpha = 0;
    lightFlash(176, 108, hex(color), 90, 700);
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

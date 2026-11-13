/**
 * The board, drawn with Pixi at a small fixed resolution (BOARD_W × BOARD_H) and scaled up by a whole number with
 * `image-rendering: pixelated`, so every art pixel is a crisp square. Pixi only draws: clicks go back to the
 * controller as slots, which picks from the server's legal actions.
 */
import {
  Application, Container, Graphics, Sprite, Text, Texture, TextureSource, TilingSprite, type FederatedPointerEvent,
} from "pixi.js";
import {
  atkOf, card, defOf, FIELDS, hasLeap, isGuarding, type DuelUpdate, type GameEvent, type GameState, type Monster,
  type PlayerId,
} from "@sigilbound/engine";
import type { Slot } from "../core/selection.js";
import { digitsCanvas } from "../gfx/digits.js";
import { AFFINITY, UI } from "../gfx/palette.js";
import { badgeCanvas, cardBackCanvas, fieldTileCanvas, monsterCanvas, spellCanvas } from "../gfx/sprites.js";
import type { Hovered } from "../ui/state.js";

export const BOARD_W = 240;
export const BOARD_H = 216;
const LANE_W = 64;
const LANE_X = [12, 88, 164];
const ROW = { oppSpell: 6, oppMonster: 25, band: 102, myMonster: 119, mySpell: 194 };
const CARD_W = 56, CARD_H = 68;
const SPELL_W = 24, SPELL_H = 16;

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

/** A 1px pixel border (filled rects, not strokes, so it never blurs). */
function border(g: Graphics, x: number, y: number, w: number, h: number, color: string | number, alpha = 1): void {
  const c = typeof color === "string" ? hex(color) : color;
  g.rect(x, y, w, 1).fill({ color: c, alpha });
  g.rect(x, y + h - 1, w, 1).fill({ color: c, alpha });
  g.rect(x, y + 1, 1, h - 2).fill({ color: c, alpha });
  g.rect(x + w - 1, y + 1, 1, h - 2).fill({ color: c, alpha });
}

function dashed(g: Graphics, x: number, y: number, w: number, h: number, color: number, alpha: number): void {
  for (let i = 0; i < w; i += 3) {
    g.rect(x + i, y, 1, 1).fill({ color, alpha });
    g.rect(x + i, y + h - 1, 1, 1).fill({ color, alpha });
  }
  for (let i = 0; i < h; i += 3) {
    g.rect(x, y + i, 1, 1).fill({ color, alpha });
    g.rect(x + w - 1, y + i, 1, 1).fill({ color, alpha });
  }
}

function slotRect(slot: Slot): { x: number; y: number; w: number; h: number } {
  if (slot.row === "face") return { x: 0, y: 0, w: BOARD_W, h: 4 };
  const lx = LANE_X[slot.lane]!;
  if (slot.row === "monster") {
    return { x: lx + (LANE_W - CARD_W) / 2, y: (slot.side === "me" ? ROW.myMonster : ROW.oppMonster) + 2, w: CARD_W, h: CARD_H };
  }
  return { x: lx + (LANE_W - SPELL_W) / 2, y: slot.side === "me" ? ROW.mySpell : ROW.oppSpell, w: SPELL_W, h: SPELL_H };
}

interface Tween {
  start: number;
  dur: number;
  step(k: number): void;
  done?(): void;
}

export interface BoardCallbacks {
  clickSlot(slot: Slot): void;
  hover(h: Hovered | null): void;
}

export interface Highlights {
  targets: Set<string>;
  selected: string | null;
  focus: Set<string>;
}

export class BoardView {
  private readonly bg = new Container();
  private readonly slots = new Container();
  private readonly cards = new Container();
  private readonly marks = new Container();
  private readonly fx = new Container();
  private tweens: Tween[] = [];
  private fieldsKey = "";
  private cardAt = new Map<string, Container>();
  private time = 0;
  private host: HTMLElement | null = null;
  private readonly resizeObs = new ResizeObserver(() => this.fit());

  private constructor(private readonly app: Application, private readonly cb: BoardCallbacks) {
    app.stage.addChild(this.bg, this.slots, this.cards, this.marks, this.fx);
    app.ticker.add((t) => {
      this.time += t.deltaMS;
      const now = performance.now();
      this.tweens = this.tweens.filter((tw) => {
        const k = Math.min(1, Math.max(0, (now - tw.start) / tw.dur));
        if (now >= tw.start) tw.step(k);
        if (k >= 1) tw.done?.();
        return k < 1;
      });
      // Highlights pulse.
      this.marks.alpha = 0.65 + 0.35 * Math.sin(this.time / 180);
    });
  }

  static async create(host: HTMLElement, cb: BoardCallbacks): Promise<BoardView> {
    const app = new Application();
    await app.init({
      width: BOARD_W, height: BOARD_H, background: "#1c1a24", antialias: false, resolution: 1, roundPixels: true,
      autoDensity: false,
    });
    app.canvas.style.imageRendering = "pixelated";
    app.canvas.classList.add("board-canvas");
    const view = new BoardView(app, cb);
    view.mount(host);
    return view;
  }

  mount(host: HTMLElement): void {
    if (this.host === host) return;
    this.resizeObs.disconnect();
    this.host = host;
    host.appendChild(this.app.canvas);
    this.resizeObs.observe(host);
    this.fit();
  }

  /** Whole-number scaling only. */
  private fit(): void {
    if (!this.host) return;
    const { clientWidth: w, clientHeight: h } = this.host;
    const scale = Math.max(1, Math.floor(Math.min(w / BOARD_W, h / BOARD_H)));
    this.app.canvas.style.width = `${BOARD_W * scale}px`;
    this.app.canvas.style.height = `${BOARD_H * scale}px`;
  }

  render(u: DuelUpdate, hl: Highlights): void {
    const s = u.view.state;
    const me = u.view.you;
    this.drawBackground(s);
    this.slots.removeChildren().forEach((c) => c.destroy());
    this.cards.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.marks.removeChildren().forEach((c) => c.destroy());
    this.cardAt.clear();

    const slotsG = new Graphics();
    this.slots.addChild(slotsG);
    for (const side of ["opp", "me"] as const) {
      const p: PlayerId = side === "me" ? me : me === 0 ? 1 : 0;
      for (let lane = 0; lane < 3; lane++) {
        const ms: Slot = { side, row: "monster", lane };
        const r = slotRect(ms);
        dashed(slotsG, r.x, r.y, r.w, r.h, 0xffffff, 0.35);
        this.hitArea(ms, r, null);
        const m = s.players[p].monsters[lane];
        if (m) this.drawMonster(s, p, lane, m, side, s.active === p);

        const ss: Slot = { side, row: "spell", lane };
        const sr = slotRect(ss);
        dashed(slotsG, sr.x, sr.y, sr.w, sr.h, 0xffffff, 0.25);
        this.hitArea(ss, sr, null);
        const sp = s.players[p].spells[lane];
        if (sp) {
          const art = sp.id === "hidden" ? cardBackCanvas() : spellCanvas(card(sp.id).kind);
          const spr = new Sprite(tex(art));
          if (sp.id === "hidden") {
            spr.rotation = Math.PI / 2;
            spr.position.set(sr.x + 22, sr.y - 2);
          } else {
            spr.position.set(sr.x + 4, sr.y);
          }
          spr.eventMode = "none";
          this.cards.addChild(spr);
          if (sp.id !== "hidden") {
            this.hitArea(ss, sr, { id: sp.id, side, lane });
            // Can it be flipped yet? A dot says so.
            if (side === "me" && sp.setTurn < s.turn && s.active === me) {
              const dot = new Graphics().rect(sr.x + sr.w - 3, sr.y + 1, 2, 2).fill(hex(UI.green));
              this.cards.addChild(dot);
            }
          }
        }
      }
    }

    // Highlights.
    const g = new Graphics();
    for (const key of hl.targets) {
      const r = this.rectOfKey(key);
      if (r) border(g, r.x - 1, r.y - 1, r.w + 2, r.h + 2, hl.focus.has(key) ? UI.target : UI.highlight);
    }
    if (hl.selected) {
      const r = this.rectOfKey(hl.selected);
      if (r) { border(g, r.x - 2, r.y - 2, r.w + 4, r.h + 4, "#ffffff"); border(g, r.x - 1, r.y - 1, r.w + 2, r.h + 2, "#ffffff"); }
    }
    this.marks.addChild(g);
  }

  private rectOfKey(key: string) {
    const [side, row, lane] = key.split(":") as ["me" | "opp", "monster" | "spell" | "face", string];
    if (row === "face") return null;
    return slotRect({ side, row, lane: Number(lane) } as Slot);
  }

  private drawBackground(s: GameState): void {
    const key = s.fields.join(",");
    if (key === this.fieldsKey) return;
    this.fieldsKey = key;
    this.bg.removeChildren().forEach((c) => c.destroy());
    const ground = new TilingSprite({ texture: tex(fieldTileCanvas("crossroads")), width: BOARD_W, height: BOARD_H });
    ground.tint = 0x777777;
    this.bg.addChild(ground);
    s.fields.forEach((f, lane) => {
      const x = LANE_X[lane]! - 4;
      const t = new TilingSprite({ texture: tex(fieldTileCanvas(f)), width: LANE_W + 8, height: BOARD_H });
      t.position.set(x, 0);
      this.bg.addChild(t);
      const edge = new Graphics();
      edge.rect(x - 1, 0, 1, BOARD_H).fill({ color: 0x000000, alpha: 0.35 });
      edge.rect(x + LANE_W + 8, 0, 1, BOARD_H).fill({ color: 0x000000, alpha: 0.35 });
      this.bg.addChild(edge);
      // A wooden sign with the field's name.
      const sign = new Graphics();
      sign.rect(x + 2, ROW.band, LANE_W + 4, 12).fill(hex(UI.woodDark));
      sign.rect(x + 3, ROW.band + 1, LANE_W + 2, 10).fill(hex(UI.wood));
      sign.rect(x + 3, ROW.band + 1, LANE_W + 2, 1).fill(hex(UI.woodLight));
      this.bg.addChild(sign);
      const label = new Text({
        text: FIELDS[f].name.toUpperCase(),
        style: { fontFamily: "Silkscreen", fontSize: 8, fill: hex(UI.paper) },
        resolution: 1,
      });
      label.position.set(Math.round(x + 4 + (LANE_W - label.width) / 2), ROW.band + 1);
      this.bg.addChild(label);
    });
    // Dim the middle seam between the two sides.
    const seam = new Graphics().rect(0, ROW.band - 3, BOARD_W, 1).fill({ color: 0x000000, alpha: 0.25 });
    this.bg.addChild(seam);
  }

  private hitArea(slot: Slot, r: { x: number; y: number; w: number; h: number }, hover: Hovered | null): void {
    const hit = new Graphics().rect(r.x, r.y, r.w, r.h).fill({ color: 0xffffff, alpha: 0.001 });
    hit.eventMode = "static";
    hit.cursor = "pointer";
    hit.on("pointertap", (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.cb.clickSlot(slot);
    });
    if (hover) {
      hit.on("pointerover", () => this.cb.hover(hover));
      hit.on("pointerout", () => this.cb.hover(null));
    }
    this.slots.addChild(hit);
  }

  private drawMonster(s: GameState, p: PlayerId, lane: number, m: Monster, side: "me" | "opp", ownersTurn: boolean): void {
    const def = card(m.id);
    const pal = AFFINITY[def.affinity];
    const slot: Slot = { side, row: "monster", lane };
    const r = slotRect(slot);
    const holder = new Container();
    holder.position.set(r.x + CARD_W / 2, r.y + CARD_H / 2);

    const body = new Container();
    const frame = new Graphics();
    frame.rect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H).fill(hex(pal.frameDark));
    frame.rect(-CARD_W / 2 + 1, -CARD_H / 2 + 1, CARD_W - 2, CARD_H - 2).fill(hex(pal.frame));
    frame.rect(-CARD_W / 2 + 3, -CARD_H / 2 + 3, CARD_W - 6, 50).fill(hex("#2a2438"));
    frame.rect(-CARD_W / 2 + 3, -CARD_H / 2 + 3, CARD_W - 6, 1).fill({ color: 0x000000, alpha: 0.4 });
    body.addChild(frame);
    const spr = new Sprite(tex(monsterCanvas(m.id)));
    spr.scale.set(2);
    spr.position.set(-24, -CARD_H / 2 + 4);
    if (side === "opp") { spr.scale.x = -2; spr.position.x = 24; } // face each other
    body.addChild(spr);
    if (m.position === "def") body.rotation = Math.PI / 2;
    const exhausted = ownersTurn && (m.attacked || m.entered === s.turn) && m.position === "atk";
    if (exhausted) spr.tint = 0x9a94a8;
    holder.addChild(body);

    // Stats plate, never rotated so it stays readable.
    const atk = atkOf(s, p, lane), dfn = defOf(s, p, lane);
    const plate = new Container();
    const atkS = new Sprite(tex(digitsCanvas(String(atk), m.position === "atk" ? "#ffb35c" : "#a89a8a")));
    const defLeft = dfn - m.damage;
    const defS = new Sprite(tex(digitsCanvas(String(defLeft), m.damage > 0 ? UI.target : m.position === "def" ? "#9fd3ff" : "#a8b8c8")));
    const pg = new Graphics();
    const pw = atkS.width + defS.width + 9;
    pg.rect(-Math.ceil(pw / 2), 0, pw, 9).fill({ color: 0x1c1a24, alpha: 0.85 });
    plate.addChild(pg);
    atkS.position.set(-Math.ceil(pw / 2) + 1, 1);
    const slash = new Sprite(tex(digitsCanvas("/", "#ffffff")));
    slash.position.set(atkS.x + atkS.width - 1, 1);
    defS.position.set(slash.x + slash.width - 1, 1);
    plate.addChild(atkS, slash, defS);
    const plateY = m.position === "def" ? CARD_W / 2 - 6 : CARD_H / 2 - 12;
    plate.position.set(0, plateY);
    holder.addChild(plate);

    // Keyword badges, top right.
    const badges: ("guard" | "leap" | "rush" | "awaken")[] = [];
    if (isGuarding(m)) badges.push("guard");
    else if (def.guard) badges.push("guard");
    if (hasLeap(s, lane, m)) badges.push("leap");
    if (def.rush && s.players[p].sigils.length <= 3) badges.push("rush");
    if (m.atkPerm || m.defPerm) badges.push("awaken");
    badges.forEach((b, i) => {
      const bs = new Sprite(tex(badgeCanvas(b)));
      const top = m.position === "def" ? -CARD_W / 2 : -CARD_H / 2;
      const right = m.position === "def" ? CARD_H / 2 : CARD_W / 2;
      bs.position.set(right - 8 - i * 8, top + 1);
      if (b === "guard" && !isGuarding(m)) bs.alpha = 0.4;
      holder.addChild(bs);
    });

    this.cards.addChild(holder);
    this.cardAt.set(`${p}:${lane}`, holder);
    // Hover for the detail panel.
    const hit = new Graphics().rect(r.x, r.y, r.w, r.h).fill({ color: 0xffffff, alpha: 0.001 });
    hit.eventMode = "static";
    hit.cursor = "pointer";
    hit.on("pointertap", (e: FederatedPointerEvent) => { e.stopPropagation(); this.cb.clickSlot(slot); });
    hit.on("pointerover", () => this.cb.hover({ id: m.id, side, lane }));
    hit.on("pointerout", () => this.cb.hover(null));
    this.slots.addChild(hit);
  }

  // ---- effects ----

  play(events: GameEvent[], prev: GameState | null, me: PlayerId): void {
    let delay = 0;
    const at = (p: PlayerId, lane: number) => slotRect({ side: p === me ? "me" : "opp", row: "monster", lane });
    for (const e of events) {
      if (e.t === "attack") {
        const holder = this.cardAt.get(`${e.p}:${e.lane}`);
        const dir = e.p === me ? -1 : 1;
        if (holder) {
          const y0 = holder.y;
          this.tween(delay, 260, (k) => { holder.y = Math.round(y0 + dir * 14 * Math.sin(k * Math.PI)); });
        } else if (prev) {
          const m = prev.players[e.p].monsters[e.lane];
          if (m) this.ghost(m.id, at(e.p, e.lane), delay, dir * 14);
        }
        delay += 160;
      } else if (e.t === "damage") {
        this.floatNumber(`-${e.amount}`, UI.target, at(e.p, e.lane), delay);
      } else if (e.t === "destroyed") {
        this.ghost(e.card, at(e.p, e.lane), delay, 0);
        delay += 120;
      } else if (e.t === "summon" || e.t === "revive") {
        const holder = this.cardAt.get(`${e.p}:${e.lane}`);
        if (holder) {
          const y0 = holder.y;
          holder.alpha = 0;
          this.tween(delay, 220, (k) => { holder.alpha = k; holder.y = Math.round(y0 - 10 * (1 - k)); });
        }
      } else if (e.t === "buff") {
        const txt = e.atk ? `${e.atk > 0 ? "+" : ""}${e.atk}` : `${e.def > 0 ? "+" : ""}${e.def}`;
        this.floatNumber(txt, e.atk ? "#ffb35c" : "#9fd3ff", at(e.p, e.lane), delay);
      } else if (e.t === "lp" && e.reason !== "Old Forest") {
        const y = e.p === me ? BOARD_H - 20 : 12;
        this.floatNumber(`${e.delta > 0 ? "+" : ""}${e.delta}`, e.delta < 0 ? UI.red : UI.green,
          { x: BOARD_W / 2 - 10, y, w: 20, h: 10 }, delay, 2);
      }
    }
  }

  private tween(delay: number, dur: number, step: (k: number) => void, done?: () => void): void {
    this.tweens.push({ start: performance.now() + delay, dur, step, done });
  }

  private ghost(id: string, r: { x: number; y: number; w: number; h: number }, delay: number, lunge: number): void {
    const spr = new Sprite(tex(monsterCanvas(id)));
    spr.scale.set(2);
    spr.position.set(r.x + 4, r.y + 2);
    spr.alpha = 0;
    this.fx.addChild(spr);
    const x0 = spr.x, y0 = spr.y;
    this.tween(delay, 520, (k) => {
      spr.alpha = k < 0.1 ? 1 : 1 - (k - 0.1) / 0.9;
      spr.tint = k < 0.4 && Math.floor(k * 20) % 2 === 0 ? 0xffffff : 0xff7766;
      spr.x = Math.round(x0 + (k < 0.5 ? Math.sin(k * 60) * 2 : 0));
      spr.y = Math.round(y0 + lunge * Math.sin(Math.min(1, k * 2) * Math.PI));
    }, () => spr.destroy());
  }

  private floatNumber(text: string, color: string, r: { x: number; y: number; w: number; h: number }, delay: number, scale = 2): void {
    const spr = new Sprite(tex(digitsCanvas(text, color)));
    spr.scale.set(scale);
    const x = Math.round(r.x + r.w / 2 - spr.width / 2), y0 = Math.round(r.y + r.h / 2 - 8);
    spr.position.set(x, y0);
    spr.alpha = 0;
    this.fx.addChild(spr);
    this.tween(delay + 100, 900, (k) => {
      spr.alpha = k < 0.15 ? 1 : 1 - Math.max(0, (k - 0.6) / 0.4);
      spr.y = Math.round(y0 - 12 * k);
    }, () => spr.destroy());
  }
}

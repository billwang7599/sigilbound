/**
 * The overworld scene (Pixi), kept thin: the rules are in core/world.ts, the art in world/art.ts.
 *
 * One fixed top-down 3/4 view like Stardew Valley: the camera follows you and stops at the map edges, the view is
 * drawn at native pixels and scaled up by a whole number, and depth is faked by drawing everything that stands on
 * the ground (you, the NPCs, trees, houses, fences) in order of where its feet are. The look is a bright cute-JRPG
 * town (world/art.ts): hard-edged ground shadows baked into the ground, pixel-stepped water ripples and a slow
 * wind through the treetops. One small pixel-safe shader pass (world/fx.ts) grades the colour and, at High, drifts
 * a faint cloud shadow; it follows the Graphics setting (off / low / high, auto-lowered on a slow machine).
 *
 * Input here is only walking (arrows / WASD). Talking, the dialogue and Esc belong to the React screen
 * (ui/screens/World.tsx), which asks this view who's in range and pauses it while you talk.
 */
import { Application, Container, Sprite, Texture, TextureSource } from "pixi.js";
import { CHIBI_ANCHOR, chibiSprite, type Appearance, type Frame } from "../gfx/chibi.js";
import { PAL } from "../gfx/palette.js";
import { WorldFx } from "./fx.js";
import {
  HUB, NO_INPUT, TILE, camera, faceToward, solidTiles, step, talkTarget, tileFeet, type Dir, type Input, type Vec, type Walker,
  type WorldMap,
} from "../core/world.js";
import type { Npc } from "../data/npcs.js";
import { WATER_FRAMES, contactShadowCanvas, groundCanvas, propArt, talkBubbleCanvas } from "./art.js";

TextureSource.defaultOptions.scaleMode = "nearest";

/** The smallest view (native pixels) we scale up from; a bigger window shows a little more of the map. */
const MIN_W = 320, MIN_H = 192;
const WALK: Frame[] = [1, 0, 2, 0];
const WALK_MS = 140;
/** Water ripples step every WATER_MS; a gust leans the treetops a pixel for WIND_MS of every WIND_CYCLE ms. */
const WATER_MS = 520, WIND_MS = 600, WIND_CYCLE = 3200;

const texCache = new Map<HTMLCanvasElement, Texture>();
function tex(c: HTMLCanvasElement): Texture {
  let t = texCache.get(c);
  if (!t) { t = Texture.from(c); t.source.scaleMode = "nearest"; texCache.set(c, t); }
  return t;
}

interface Person {
  look: Appearance;
  walker: Walker;
  sprite: Sprite;
  shadow: Sprite;
  phase: number;
}

export interface WorldOptions {
  appearance: Appearance;
  start: { pos: Vec; facing: Dir };
  npcs: Npc[];
  map?: WorldMap;
}

export class WorldView {
  private readonly map: WorldMap;
  private readonly scene = new Container({ label: "scene" });
  private readonly world = new Container({ label: "world" });
  private readonly ground = new Container({ label: "ground" });
  private readonly shadows = new Container({ label: "shadows" });
  private readonly entities = new Container({ label: "entities", sortableChildren: true });
  private readonly fx = new Container({ label: "fx" });
  private readonly player: Person;
  private readonly npcs = new Map<string, Person & { npc: Npc }>();
  private readonly solid: Set<string>;
  private readonly bubble: Sprite;
  private readonly keys = new Set<string>();
  private post: WorldFx | null = null;
  private readonly groundSprite: Sprite;
  private readonly groundTex: Texture[];
  private readonly swaying: { sprite: Sprite; still: Texture; sway: Texture; phase: number }[] = [];
  private host: HTMLElement | null = null;
  private readonly resizeObs = new ResizeObserver(() => this.fit());
  private time = 0;
  private walkClock = 0;
  private cam: Vec = { x: 0, y: 0 };
  private destroyed = false;
  /** While a dialogue is open: no walking. */
  paused = false;
  /** Called when who you'd talk to changes (null: nobody in range). */
  onNear: (npcId: string | null) => void = () => {};
  private near: string | null = null;

  private constructor(private readonly app: Application, opts: WorldOptions) {
    this.map = opts.map ?? HUB;
    this.world.addChild(this.ground, this.shadows, this.entities);
    this.scene.addChild(this.world, this.fx);
    app.stage.addChild(this.scene);

    this.groundTex = Array.from({ length: WATER_FRAMES }, (_, f) => tex(groundCanvas(this.map, f)));
    this.groundSprite = new Sprite(this.groundTex[0]);
    this.ground.addChild(this.groundSprite);
    for (const prop of this.map.props) {
      const a = propArt(prop, this.map);
      const s = new Sprite(tex(a.canvas));
      s.position.set(prop.x * TILE + a.dx, prop.y * TILE + a.dy);
      s.zIndex = a.sortY;
      this.entities.addChild(s);
      // The gust rolls across the map from left to right, with a little jitter so neighbours don't move as one.
      if (a.sway) this.swaying.push({ sprite: s, still: tex(a.canvas), sway: tex(a.sway), phase: prop.x * 90 + ((prop.y * 37) % 5) * 60 });
    }

    const shadowTex = tex(contactShadowCanvas());
    const person = (look: Appearance, walker: Walker, phase: number): Person => {
      const sprite = new Sprite(tex(chibiSprite(look, walker.facing, 0)));
      sprite.anchor.set(CHIBI_ANCHOR.x, CHIBI_ANCHOR.y);
      const shadow = new Sprite(shadowTex);
      shadow.anchor.set(0.5, 0.5);
      this.entities.addChild(sprite);
      this.shadows.addChild(shadow);
      return { look, walker, sprite, shadow, phase };
    };
    opts.npcs.forEach((npc, i) => {
      const p = person(npc.appearance, { pos: tileFeet(npc.tile.x, npc.tile.y), facing: npc.facing, moving: false }, i * 431);
      this.npcs.set(npc.id, { ...p, npc });
    });
    this.solid = solidTiles([...this.npcs.values()].map((n) => ({ id: n.npc.id, pos: n.walker.pos })));
    this.player = person(opts.appearance, { pos: { ...opts.start.pos }, facing: opts.start.facing, moving: false }, 0);

    this.bubble = new Sprite(tex(talkBubbleCanvas()));
    this.bubble.anchor.set(0.5, 1);
    this.bubble.visible = false;
    this.fx.addChild(this.bubble);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    app.ticker.add(this.tick);
  }

  static async create(host: HTMLElement, opts: WorldOptions): Promise<WorldView> {
    const app = new Application();
    const { w, h } = WorldView.viewFor(host, opts.map ?? HUB);
    await app.init({ width: w, height: h, background: PAL.ink, antialias: false, resolution: 1, roundPixels: true, autoDensity: false });
    app.canvas.style.imageRendering = "pixelated";
    app.canvas.classList.add("board-canvas", "world-canvas");
    const view = new WorldView(app, opts);
    view.mount(host);
    return view;
  }

  /** The native view size for a host: whole-number scale, at least MIN_W×MIN_H, never bigger than the map. */
  private static viewFor(host: HTMLElement, m: WorldMap): { w: number; h: number; scale: number } {
    const hw = Math.max(1, host.clientWidth || MIN_W * 2), hh = Math.max(1, host.clientHeight || MIN_H * 2);
    const scale = Math.max(1, Math.floor(Math.min(hw / MIN_W, hh / MIN_H)));
    return { w: Math.min(m.w * TILE, Math.ceil(hw / scale)), h: Math.min(m.h * TILE, Math.ceil(hh / scale)), scale };
  }

  private mount(host: HTMLElement): void {
    this.host = host;
    host.appendChild(this.app.canvas);
    this.resizeObs.observe(host);
    this.fit();
  }

  private fit(): void {
    if (!this.host || this.destroyed) return;
    const { w, h, scale } = WorldView.viewFor(this.host, this.map);
    if (w !== this.app.screen.width || h !== this.app.screen.height || !this.post) {
      this.app.renderer.resize(w, h);
      // The shader layer is sized to the view, so a new size needs a new one.
      this.dropPost();
      this.post = new WorldFx(this.world, w, h);
    }
    this.app.canvas.style.width = `${w * scale}px`;
    this.app.canvas.style.height = `${h * scale}px`;
    this.place();
  }

  // ---- input ----

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = moveKey(e.key);
    if (!k) return;
    e.preventDefault();
    this.keys.add(k);
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const k = moveKey(e.key);
    if (k) this.keys.delete(k);
  };
  private readonly onBlur = (): void => this.keys.clear();

  private input(): Input {
    if (this.paused) return NO_INPUT;
    return { up: this.keys.has("up"), down: this.keys.has("down"), left: this.keys.has("left"), right: this.keys.has("right") };
  }

  // ---- for the React screen ----

  /** Who you'd talk to right now (null: nobody close). */
  talkTarget(): string | null {
    return talkTarget(this.player.walker, [...this.npcs.values()].map((n) => ({ id: n.npc.id, pos: n.walker.pos })));
  }

  /** Where you stand and face (to remember across a duel). */
  get playerState(): { pos: Vec; facing: Dir } {
    return { pos: { ...this.player.walker.pos }, facing: this.player.walker.facing };
  }

  /** An NPC turns to look at you (when you talk). */
  faceNpcToPlayer(id: string): void {
    const n = this.npcs.get(id);
    if (!n) return;
    n.walker = { ...n.walker, facing: faceToward(n.walker.pos, this.player.walker.pos) };
    // And you look at them.
    this.player.walker = { ...this.player.walker, facing: faceToward(this.player.walker.pos, n.walker.pos) };
  }

  /** An NPC goes back to how they stood. */
  resetNpc(id: string): void {
    const n = this.npcs.get(id);
    if (n) n.walker = { ...n.walker, facing: n.npc.facing };
  }

  /** Smoothed frame rate (from the shader pass). */
  get fps(): number { return this.post?.fps ?? 60; }

  // ---- frame ----

  private readonly tick = (t: { deltaMS: number }): void => {
    if (this.destroyed) return;
    this.time += t.deltaMS;
    const before = this.player.walker;
    this.player.walker = step(this.map, before, this.input(), t.deltaMS, this.solid);
    if (this.player.walker.moving) this.walkClock += t.deltaMS;
    else this.walkClock = 0;
    const near = this.paused ? this.near : this.talkTarget();
    if (near !== this.near) { this.near = near; this.onNear(near); }
    this.animate();
    this.place();
    this.post?.update(t.deltaMS, this.cam);
  };

  private drawPerson(p: Person, frame: Frame, bob: number): void {
    const { pos, facing } = p.walker;
    p.sprite.texture = tex(chibiSprite(p.look, facing, frame));
    p.sprite.position.set(Math.round(pos.x), Math.round(pos.y) - bob);
    p.sprite.zIndex = pos.y;
    p.shadow.position.set(Math.round(pos.x) + 1, Math.round(pos.y) - 1);
  }

  /** Put everything where it goes for this frame: people, the camera, the talk bubble. */
  private place(): void {
    const pw = this.player.walker;
    this.drawPerson(this.player, pw.moving ? WALK[Math.floor(this.walkClock / WALK_MS) % WALK.length]! : 0, 0);
    for (const n of this.npcs.values()) {
      // Idle: a slow one-pixel breath, out of step with each other.
      const bob = Math.floor((this.time + n.phase) / 650) % 2;
      this.drawPerson(n, 0, bob);
    }
    this.cam = camera(this.map, pw.pos, this.app.screen.width, this.app.screen.height);
    for (const layer of [this.ground, this.shadows, this.entities, this.fx]) layer.position.set(-this.cam.x, -this.cam.y);
    const target = this.near ? this.npcs.get(this.near) : null;
    this.bubble.visible = !!target && !this.paused;
    if (target) {
      const hop = Math.floor(this.time / 400) % 2;
      this.bubble.position.set(Math.round(target.walker.pos.x) + 1, Math.round(target.walker.pos.y) - 31 - hop);
    }
  }

  /** The art's own motion: water ripple frames and the wind through the treetops (whole pixels, no shader). */
  private animate(): void {
    this.groundSprite.texture = this.groundTex[Math.floor(this.time / WATER_MS) % this.groundTex.length]!;
    for (const t of this.swaying) {
      const k = (this.time + WIND_CYCLE * 4 - t.phase) % WIND_CYCLE;
      t.sprite.texture = k < WIND_MS ? t.sway : t.still;
    }
  }

  /** Unhook the shader passes before freeing them (Pixi warns about textures freed while still bound). */
  private dropPost(): void {
    this.world.filters = null;
    this.post?.destroy();
    this.post = null;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.resizeObs.disconnect();
    this.app.ticker.remove(this.tick);
    this.dropPost();
    this.app.canvas.remove();
    // Textures are cached across visits (the art is the same), so only the scene graph goes.
    this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
  }
}

function moveKey(key: string): "up" | "down" | "left" | "right" | null {
  switch (key) {
    case "ArrowUp": case "w": case "W": return "up";
    case "ArrowDown": case "s": case "S": return "down";
    case "ArrowLeft": case "a": case "A": return "left";
    case "ArrowRight": case "d": case "D": return "right";
    default: return null;
  }
}

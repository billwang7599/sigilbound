/**
 * The shader layer over the Pixi board ("shader-pack" look: crisp pixel art under real-feeling light).
 *
 *   world  (table, cards, Sigils, piles)  → WorldLight: sun + normals + shadows + AO + point lights
 *   scene  (world + highlights + effects) → Post: bloom, god rays, haze, motes, grade, chroma, vignette
 *   labels (ATK/DEF plates, badges, LP, counts) → drawn after both, untouched, so numbers stay sharp
 *
 * Everything renders at the board's native resolution; the canvas is upscaled with nearest-neighbour in CSS.
 * Graphics "off" removes every filter, so the board is exactly the plain pixel-art build.
 */
import { Container, Filter, GlProgram, Rectangle, RenderTexture, type Application } from "pixi.js";
import { PAL, hexNum } from "../../gfx/palette.js";
import { POST_FRAG, VERTEX, WORLD_FRAG } from "./glsl.js";
import { liveFlashes, type Light } from "./lights.js";
import { autoLower, gfxLevel, onGfxChange, type GfxLevel } from "./settings.js";

const MAX_LIGHTS = 16;

const rgb = (n: number): [number, number, number] => [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];

export interface PostLayers {
  world: Container;
  scene: Container;
  /** Containers whose shapes cast shadows (cards, Sigils, piles). */
  casters: Container[];
}

export class PostFx {
  private readonly worldFilter: Filter;
  private readonly postFilter: Filter;
  private readonly occ: RenderTexture;
  private level: GfxLevel = "off";
  private time = 0;
  private slow = 0;
  /** Smoothed frames per second (for the guard and for reporting). */
  fps = 60;
  private readonly unsub: () => void;
  private readonly lightBuf = new Float32Array(MAX_LIGHTS * 4);
  private readonly colorBuf = new Float32Array(MAX_LIGHTS * 4);

  constructor(private readonly app: Application, private readonly layers: PostLayers, private readonly steady: () => Light[]) {
    const W = app.screen.width, H = app.screen.height;
    this.occ = RenderTexture.create({ width: W, height: H, resolution: 1, antialias: false, scaleMode: "nearest" });
    const sun = rgb(hexNum(PAL.gold4)).map((v) => v * 0.42) as [number, number, number];
    this.worldFilter = new Filter({
      glProgram: GlProgram.from({ vertex: VERTEX, fragment: WORLD_FRAG, name: "sigil-world" }),
      resources: {
        uOcc: this.occ.source,
        world: {
          uBoard: { value: new Float32Array([W, H]), type: "vec2<f32>" },
          uSunDir: { value: new Float32Array([0.62, 0.78]), type: "vec2<f32>" },
          uSun: { value: new Float32Array(sun), type: "vec3<f32>" },
          uAmbient: { value: new Float32Array([0.68, 0.67, 0.76]), type: "vec3<f32>" },
          uShadows: { value: 1, type: "f32" },
          uNormals: { value: 1, type: "f32" },
          uLightCount: { value: 0, type: "i32" },
          uLights: { value: this.lightBuf, type: "vec4<f32>", size: MAX_LIGHTS },
          uLightColors: { value: this.colorBuf, type: "vec4<f32>", size: MAX_LIGHTS },
        },
      },
      resolution: 1,
      antialias: "off",
    });
    this.postFilter = new Filter({
      glProgram: GlProgram.from({ vertex: VERTEX, fragment: POST_FRAG, name: "sigil-post" }),
      resources: {
        post: {
          uBoard: { value: new Float32Array([W, H]), type: "vec2<f32>" },
          uTime: { value: 0, type: "f32" },
          uHigh: { value: 1, type: "f32" },
          uSunPos: { value: new Float32Array([-70, -90]), type: "vec2<f32>" },
          uSun: { value: new Float32Array(rgb(hexNum(PAL.gold4))), type: "vec3<f32>" },
        },
      },
      resolution: 1,
      antialias: "off",
    });
    // Filters cover the whole board, so pixel coordinates in the shaders are board pixels.
    layers.world.filterArea = new Rectangle(0, 0, W, H);
    layers.scene.filterArea = new Rectangle(0, 0, W, H);
    this.apply(gfxLevel());
    this.unsub = onGfxChange(() => this.apply(gfxLevel()));
  }

  get current(): GfxLevel {
    return this.level;
  }

  private apply(level: GfxLevel): void {
    this.level = level;
    this.slow = 0;
    if (level === "off") {
      this.layers.world.filters = null;
      this.layers.scene.filters = null;
      return;
    }
    const high = level === "high";
    const w = this.worldFilter.resources.world.uniforms;
    w.uShadows = high ? 1 : 0;
    w.uNormals = high ? 1 : 0.6;
    this.postFilter.resources.post.uniforms.uHigh = high ? 1 : 0;
    this.layers.world.filters = [this.worldFilter];
    this.layers.scene.filters = [this.postFilter];
  }

  /** Once per frame, before Pixi renders. */
  update(deltaMS: number): void {
    // Frame-rate guard: at High, if we stay under ~50 fps for 3 seconds, drop to Low.
    const inst = deltaMS > 0 ? 1000 / deltaMS : 60;
    this.fps = this.fps * 0.95 + inst * 0.05;
    if (this.level === "high") {
      this.slow = this.fps < 50 ? this.slow + deltaMS : 0;
      if (this.slow > 3000) autoLower();
    }
    if (this.level === "off") return;
    this.time += deltaMS / 1000;
    this.postFilter.resources.post.uniforms.uTime = this.time;

    const lights = [...this.steady(), ...liveFlashes()].slice(0, MAX_LIGHTS);
    lights.forEach((l, i) => {
      this.lightBuf.set([l.x, l.y, l.radius, l.intensity], i * 4);
      const [r, g, b] = rgb(l.color);
      this.colorBuf.set([r, g, b, 1], i * 4);
    });
    const w = this.worldFilter.resources.world.uniforms;
    w.uLightCount = lights.length;
    w.uLights = this.lightBuf;
    w.uLightColors = this.colorBuf;

    if (this.level === "high") {
      // The occluder mask: the casters drawn again into an offscreen texture (alpha is what matters).
      const r = this.app.renderer;
      this.layers.casters.forEach((c, i) => r.render({ container: c, target: this.occ, clear: i === 0 }));
    }
  }

  destroy(): void {
    this.unsub();
    this.occ.destroy(true);
  }
}

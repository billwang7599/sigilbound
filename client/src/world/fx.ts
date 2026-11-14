/**
 * The overworld's one shader pass, kept pixel-art-safe. The world used to borrow the duel board's PostFx (warm sun
 * tint, normal-guessed lighting, soft shadows, lamp glows, bloom, god rays, motes, vignette), which smeared smooth
 * gradients and glows over hard pixels and read as "weird". Here instead:
 *
 * - The view is already drawn at native pixels and scaled up by a whole number in CSS, and the camera is snapped to
 *   whole pixels (core/world.ts camera()), so this pass runs at native resolution and samples exact pixel centres.
 * - Low: a gentle colour grade only (a touch more saturation, cool shadows, warm highlights). No tint wash, no
 *   vignette, no bloom.
 * - High: the grade plus a faint drifting cloud shadow: big soft noise thresholded to one hard-edged step
 *   (a 4×4 ordered dither only on its one-pixel edge band), moving in whole world pixels.
 * - Off: no filter at all; the plain pixel art.
 *
 * Ground shadows, wind and water ripples are in the art (world/art.ts), not here. Same frame-rate guard as the board:
 * under ~50 fps at High for 3 s drops the session to Low.
 */
import { Filter, GlProgram, Rectangle, type Container } from "pixi.js";
import { VERTEX } from "../visuals/shaders/glsl.js";
import { autoLower, gfxLevel, onGfxChange, type GfxLevel } from "../visuals/shaders/settings.js";

const FRAG = /* glsl */ `
precision highp float;
in vec2 vTextureCoord;
in vec2 vScreen;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec2 uCam;
uniform float uTime;
uniform float uHigh;

float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 p) { return bayer2(0.5 * p) * 0.25 + bayer2(p) + 0.5 / 16.0; }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main(void) {
  vec4 src = texture(uTexture, vTextureCoord);
  vec3 c = src.a > 0.0 ? src.rgb / src.a : src.rgb;
  float l = luma(c);
  // Grade: a little more colour, shadows a touch cooler, highlights a touch warmer.
  c = mix(vec3(l), c, 1.08);
  c *= mix(vec3(0.97, 0.98, 1.03), vec3(1.02, 1.0, 0.97), smoothstep(0.25, 0.8, l));

  if (uHigh > 0.5) {
    // Whole world pixels: the screen pixel plus the (whole-pixel) camera, drift stepped a pixel at a time.
    vec2 w = floor(vScreen) + uCam;
    vec2 drift = floor(vec2(uTime * 5.0, uTime * 2.0));
    vec2 q = (w - drift) / 110.0;
    float n = vnoise(q) * 0.65 + vnoise(q * 2.3 + 7.0) * 0.35;
    float edge = n - 0.6;
    // One hard step; only the band right at the edge is dithered, so it never becomes a gradient.
    float inside = edge > 0.012 ? 1.0 : edge > -0.012 ? step(bayer4(w), 0.5) : 0.0;
    c *= mix(vec3(1.0), vec3(0.87, 0.89, 0.96), inside);
  }
  finalColor = vec4(clamp(c, 0.0, 1.0) * src.a, src.a);
}
`;

export class WorldFx {
  private readonly filter: Filter;
  private level: GfxLevel = "off";
  private time = 0;
  private slow = 0;
  fps = 60;
  private readonly unsub: () => void;
  private readonly camBuf = new Float32Array(2);

  constructor(private readonly target: Container, width: number, height: number) {
    this.filter = new Filter({
      glProgram: GlProgram.from({ vertex: VERTEX, fragment: FRAG, name: "sigil-world-grade" }),
      resources: {
        grade: {
          uCam: { value: new Float32Array([0, 0]), type: "vec2<f32>" },
          uTime: { value: 0, type: "f32" },
          uHigh: { value: 1, type: "f32" },
        },
      },
      resolution: 1,
      antialias: "off",
    });
    target.filterArea = new Rectangle(0, 0, width, height);
    this.apply(gfxLevel());
    this.unsub = onGfxChange(() => this.apply(gfxLevel()));
  }

  get current(): GfxLevel { return this.level; }

  private apply(level: GfxLevel): void {
    this.level = level;
    this.slow = 0;
    if (level === "off") { this.target.filters = null; return; }
    this.filter.resources.grade.uniforms.uHigh = level === "high" ? 1 : 0;
    this.target.filters = [this.filter];
  }

  /** Once per frame: the camera (whole world pixels) and the clock. */
  update(deltaMS: number, cam: { x: number; y: number }): void {
    const inst = deltaMS > 0 ? 1000 / deltaMS : 60;
    this.fps = this.fps * 0.95 + inst * 0.05;
    if (this.level === "high") {
      this.slow = this.fps < 50 ? this.slow + deltaMS : 0;
      if (this.slow > 3000) autoLower();
    }
    if (this.level === "off") return;
    this.time += deltaMS / 1000;
    const u = this.filter.resources.grade.uniforms;
    u.uTime = this.time;
    this.camBuf[0] = Math.round(cam.x);
    this.camBuf[1] = Math.round(cam.y);
    u.uCam = this.camBuf;
  }

  destroy(): void {
    this.unsub();
    this.target.filters = null;
    this.filter.destroy();
  }
}

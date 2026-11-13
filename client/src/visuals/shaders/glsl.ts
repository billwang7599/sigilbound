/**
 * GLSL for the two post passes. Both run at the board's native 336×216 and sample at exact pixel centres, so the
 * lighting lands on the pixel grid and the CSS nearest-neighbour upscale keeps every pixel square and crisp.
 */

/** Pixi 8's standard filter vertex shader, plus the screen-space (board) pixel position. */
export const VERTEX = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vScreen;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  vScreen = position;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}
`;

const COMMON = /* glsl */ `
// 4×4 ordered dither without arrays (works on WebGL1 / GLSL ES 1.0 too).
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 p) { return bayer2(0.5 * p) * 0.25 + bayer2(p) + 0.5 / 16.0; }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
`;

/**
 * World lighting: a warm sun from the top left with ambient fill, normals guessed from the art's own shading
 * (a height map from luminance), soft cast shadows and contact occlusion from an occluder mask of the cards,
 * and up to 16 coloured point lights. The light amount is quantised with an ordered dither so it stays pixel art.
 */
export const WORLD_FRAG = /* glsl */ `
precision highp float;
in vec2 vTextureCoord;
in vec2 vScreen;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uOcc;
uniform vec4 uInputSize;
uniform vec2 uBoard;
uniform vec2 uSunDir;
uniform vec3 uSun;
uniform vec3 uAmbient;
uniform float uShadows;
uniform float uNormals;
uniform int uLightCount;
uniform vec4 uLights[16];
uniform vec4 uLightColors[16];
${COMMON}
vec3 px(vec2 o) { return texture(uTexture, vTextureCoord + o * uInputSize.zw).rgb; }
float occ(vec2 p) { return texture(uOcc, (floor(p) + 0.5) / uBoard).a; }
void main(void) {
  vec4 src = texture(uTexture, vTextureCoord);
  vec2 p = floor(vScreen);
  // Height from luminance; normals from its slope (a cheap per-pixel normal map made from the art's shading).
  float hl = luma(px(vec2(-1., 0.))), hr = luma(px(vec2(1., 0.)));
  float hu = luma(px(vec2(0., -1.))), hd = luma(px(vec2(0., 1.)));
  vec3 n = normalize(vec3((hl - hr) * 2.2 * uNormals, (hu - hd) * 2.2 * uNormals, 1.0));
  vec3 L = normalize(vec3(-uSunDir, 0.9));
  float ndl = max(dot(n, L), 0.0);
  // Flat surfaces sit at about 1.0; slopes facing the sun brighten, slopes away darken.
  vec3 light = uAmbient + uSun * (0.62 + 0.55 * (ndl - L.z));
  // Shadows cast by cards, falling away from the sun, and contact occlusion where cards meet the table.
  float self = occ(p);
  if (uShadows > 0.5) {
    float s = 0.0;
    for (int k = 1; k <= 6; k++) {
      float fk = float(k);
      s = max(s, occ(p - uSunDir * fk * 1.15) * (1.0 - fk / 7.5));
    }
    float ao = 0.0;
    ao += occ(p + vec2(2., 0.)) + occ(p + vec2(-2., 0.)) + occ(p + vec2(0., 2.)) + occ(p + vec2(0., -2.));
    ao += occ(p + vec2(3., 3.)) + occ(p + vec2(-3., 3.)) + occ(p + vec2(3., -3.)) + occ(p + vec2(-3., -3.));
    ao /= 8.0;
    float shade = (1.0 - self) * (0.62 * s + 0.36 * ao);
    light *= 1.0 - shade;
  }
  // Point lights: they light the surface (multiply) and scatter a little into the air (add), so glows show
  // even on dark felt and velvet.
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= uLightCount) break;
    vec4 l = uLights[i];
    vec2 d = l.xy - (p + 0.5);
    float dist = length(d);
    float att = clamp(1.0 - dist / l.z, 0.0, 1.0);
    att *= att;
    float facing = 0.45 + 0.55 * max(dot(n, normalize(vec3(d, 14.0))), 0.0);
    light += uLightColors[i].rgb * l.w * att * facing;
    glow += uLightColors[i].rgb * l.w * att * 0.26;
  }
  // Quantise the light to the pixel grid with an ordered dither: banded, crisp, never smeared.
  light = floor(light * 20.0 + bayer4(p)) / 20.0;
  glow = floor(glow * 24.0 + bayer4(p + 2.0)) / 24.0;
  finalColor = vec4(src.rgb * light + glow * src.a, src.a);
}
`;

/**
 * Post: bloom on bright pixels, soft god rays and haze from the sun corner, drifting dust motes, gentle filmic
 * tonemapping with split toning, a slight chromatic fringe toward the edges, and a dithered vignette.
 */
export const POST_FRAG = /* glsl */ `
precision highp float;
in vec2 vTextureCoord;
in vec2 vScreen;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec2 uBoard;
uniform float uTime;
uniform float uHigh;
uniform vec2 uSunPos;
uniform vec3 uSun;
${COMMON}
vec3 at(vec2 o) { return texture(uTexture, vTextureCoord + o * uInputSize.zw).rgb; }
vec3 bright(vec2 o) { vec3 c = at(o); float l = luma(c); return c * smoothstep(0.66, 0.95, l); }
vec3 tonemap(vec3 x) {
  // A soft filmic shoulder that keeps mid-tones where the art put them.
  vec3 a = x * (1.0 + x / 6.0) / (1.0 + x * 0.85);
  return mix(x, a, 0.55);
}
void main(void) {
  vec2 p = floor(vScreen);
  vec2 uv = (p + 0.5) / uBoard;
  vec3 col = at(vec2(0.0));
  // Chromatic depth: past the inner area, red and blue shift one whole pixel outward (crisp, not smeared).
  vec2 fromC = uv - 0.5;
  float edge = length(fromC * vec2(1.0, uBoard.y / uBoard.x));
  // Only in the outer rim, and only half-blended, so it reads as lens depth rather than a misprint.
  if (uHigh > 0.5 && edge > 0.5) {
    vec2 dir = sign(fromC) * step(0.3, abs(fromC));
    col.r = mix(col.r, at(dir).r, 0.45);
    col.b = mix(col.b, at(-dir).b, 0.45);
  }
  if (uHigh > 0.5) {
    // Bloom: a 24-tap disc of thresholded brightness, added softly on top of the art.
    vec3 b = vec3(0.0);
    for (int i = 0; i < 24; i++) {
      float a = float(i) * 2.39996;
      float r = 1.5 + float(i) * 0.42;
      b += bright(vec2(cos(a), sin(a)) * r) * (1.0 - float(i) / 26.0);
    }
    col += b / 6.5;
    // God rays: soft beams fanning from the sun corner, with haze that thickens near it.
    vec2 toP = p - uSunPos;
    float ang = atan(toP.y, toP.x);
    float dist = length(toP);
    float beams = 0.5 + 0.5 * sin(ang * 23.0 + sin(ang * 7.0 + uTime * 0.05) * 2.0);
    beams *= 0.5 + 0.5 * sin(ang * 11.0 - uTime * 0.08);
    float fall = exp(-dist / 230.0);
    col += uSun * (beams * 0.16 + 0.06) * fall;
    // Dust motes: one pixel each, drifting through the light.
    vec2 cell = floor(p / 18.0);
    float h = hash(cell);
    if (h > 0.45) {
      vec2 speed = vec2(0.6 + h * 0.8, -0.35 - h * 0.4);
      vec2 mp = cell * 18.0 + mod(vec2(h * 97.0, h * 53.0) + speed * uTime, 18.0);
      if (floor(mp) == p) col += uSun * (0.35 + 0.25 * sin(uTime * 2.0 + h * 40.0)) * (0.4 + fall);
    }
  } else {
    vec2 toP = p - uSunPos;
    col += uSun * 0.04 * exp(-length(toP) / 230.0);
  }
  // Grade: filmic shoulder, cool shadows / warm highlights, a touch more saturation.
  col = tonemap(col);
  float l = luma(col);
  col += mix(vec3(-0.01, 0.0, 0.025), vec3(0.03, 0.012, -0.02), smoothstep(0.15, 0.75, l));
  col = mix(vec3(luma(col)), col, 1.08);
  // Vignette, dithered so its edge is a pixel pattern rather than a blur.
  float v = smoothstep(0.42, 0.78, edge);
  col *= 1.0 - 0.38 * step(bayer4(p), v * 1.2) * v - 0.12 * v;
  finalColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

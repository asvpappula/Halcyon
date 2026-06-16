// GLSL for the develop pipeline. The fragment shader MIRRORS engine/ops.ts exactly
// (the single source of truth). engine/equivalence.ts asserts they agree within ΔE.
// Keep this and ops.ts in lockstep — edit both, or the match-strength readout lies.

export const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
uniform vec2 uScale;
uniform vec2 uOffset;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 1.0 - (aPos.y * 0.5 + 0.5));
  gl_Position = vec4(aPos * uScale + uOffset, 0.0, 1.0);
}`

export const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uImage;
uniform float uExposure, uContrast, uHighlights, uShadows, uWhites, uBlacks, uTemp, uTint, uVibrance, uSaturation;
uniform float uHslHue[8];
uniform float uHslSat[8];
uniform float uHslLum[8];

const float HSL_BANDS[8] = float[8](0.0, 30.0, 60.0, 120.0, 180.0, 240.0, 270.0, 300.0);

float srgbToLinear(float c) { return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
float linearToSrgb(float c) { c = clamp(c, 0.0, 1.0); return c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1.0 / 2.4) - 0.055; }
float luma(vec3 c) { return dot(c, vec3(0.2126729, 0.7151522, 0.072175)); }
float ss(float e0, float e1, float x) { float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec3 s = texture(uImage, vUv).rgb;
  vec3 c = vec3(srgbToLinear(s.r), srgbToLinear(s.g), srgbToLinear(s.b));

  // (1) white balance — diagonal gain
  float kt = uTemp / 100.0, ki = uTint / 100.0;
  c.r *= max(0.0, 1.0 + 0.3 * kt + 0.1 * ki);
  c.g *= max(0.0, 1.0 - 0.2 * ki);
  c.b *= max(0.0, 1.0 - 0.3 * kt + 0.1 * ki);

  // (2) exposure
  c *= pow(2.0, (uExposure / 100.0) * 2.0);

  // (3) contrast — pivot 0.18
  float ct = 1.0 + (uContrast / 100.0) * 0.6;
  c = (c - 0.18) * ct + 0.18;

  // (4) tone regions
  float Y = clamp(luma(c), 0.0, 1.0);
  float toneGain = 1.0
    + 0.5 * (uHighlights / 100.0) * ss(0.5, 1.0, Y)
    + 0.5 * (uShadows / 100.0) * ss(0.5, 0.0, Y)
    + 0.5 * (uWhites / 100.0) * ss(0.7, 1.0, Y)
    + 0.5 * (uBlacks / 100.0) * ss(0.3, 0.0, Y);
  c *= toneGain;

  // (5) tone curve — identity in v1 (matches ops.ts)

  // (6) saturation + vibrance
  float Y2 = luma(c);
  float chroma = max(max(abs(c.r - Y2), abs(c.g - Y2)), abs(c.b - Y2));
  float sat = 1.0 + uSaturation / 100.0;
  float vib = 1.0 + (uVibrance / 100.0) * (1.0 - clamp(chroma * 2.0, 0.0, 1.0));
  float sfac = sat * vib;
  c = vec3(Y2) + (c - vec3(Y2)) * sfac;

  // (7) HSL / color mixer — render-only. Skipped entirely (exact identity, so the
  // equivalence gate is unaffected) unless some band is non-zero. The HSV round-trip
  // is not bit-exact, so it must NOT run when inactive. Grays (chroma ~0) have no
  // meaningful hue and are left untouched.
  float hslSum = 0.0;
  for (int i = 0; i < 8; i++) hslSum += abs(uHslHue[i]) + abs(uHslSat[i]) + abs(uHslLum[i]);
  if (hslSum > 0.0) {
    vec3 hsv = rgb2hsv(max(c, vec3(0.0)));
    if (hsv.y > 0.01) {
      float hueDeg = hsv.x * 360.0;
      float wSum = 0.0, hueShift = 0.0, satAdj = 0.0, lumAdj = 0.0;
      for (int i = 0; i < 8; i++) {
        float dist = abs(hueDeg - HSL_BANDS[i]);
        dist = min(dist, 360.0 - dist);
        float w = max(0.0, 1.0 - dist / 45.0);
        wSum += w;
        hueShift += w * (uHslHue[i] / 100.0) * 30.0;
        satAdj += w * (uHslSat[i] / 100.0);
        lumAdj += w * (uHslLum[i] / 100.0) * 0.5;
      }
      if (wSum > 1e-4) { hueShift /= wSum; satAdj /= wSum; lumAdj /= wSum; }
      hsv.x = fract((hueDeg + hueShift) / 360.0);
      hsv.y = clamp(hsv.y * (1.0 + satAdj), 0.0, 1.0);
      hsv.z = max(0.0, hsv.z * (1.0 + lumAdj));
      c = hsv2rgb(hsv);
    }
  }

  outColor = vec4(linearToSrgb(c.r), linearToSrgb(c.g), linearToSrgb(c.b), 1.0);
}`

export const PARAM_UNIFORMS = [
  'uExposure',
  'uContrast',
  'uHighlights',
  'uShadows',
  'uWhites',
  'uBlacks',
  'uTemp',
  'uTint',
  'uVibrance',
  'uSaturation',
] as const

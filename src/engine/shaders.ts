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

float srgbToLinear(float c) { return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
float linearToSrgb(float c) { c = clamp(c, 0.0, 1.0); return c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1.0 / 2.4) - 0.055; }
float luma(vec3 c) { return dot(c, vec3(0.2126729, 0.7151522, 0.072175)); }
float ss(float e0, float e1, float x) { float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }

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

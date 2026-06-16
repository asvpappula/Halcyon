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
precision highp sampler3D;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uImage;
uniform float uExposure, uContrast, uHighlights, uShadows, uWhites, uBlacks, uTemp, uTint, uVibrance, uSaturation;
uniform float uHslHue[8];
uniform float uHslSat[8];
uniform float uHslLum[8];
uniform float uSharpen, uNoiseReduction, uVignette, uGrain;
uniform float uSharpenRadius, uSharpenDetail, uSharpenMasking, uColorNoiseReduction;
uniform float uVignetteMidpoint, uVignetteFeather, uVignetteRoundness, uGrainSize, uGrainRoughness;
uniform float uTexture, uClarity, uDehaze; // Presence (render-only)
uniform float uStraighten, uPerspectiveH, uPerspectiveV; // geometry (render-only)
uniform vec3 uCgSh, uCgMid, uCgHi; // color grading per region: [hue 0..360, sat 0..100, lum -100..100]
uniform float uCgBalance; // -100..100 pivot shift
uniform vec2 uTexel; // 1 / source size, for neighbor taps (0 when effects unused)
uniform sampler2D uCurve; // 256×1 baked tone-curve LUT (master ∘ per-channel)
uniform float uCurveActive; // 0 = skip (exact identity), 1 = apply
uniform sampler3D uLut; // imported 3D LUT volume (bound on texture unit 2)
uniform float uLutActive, uLutAmount, uLutSize; // 0 = skip; amount 0..100; cube edge size

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
vec3 linSample(vec2 uv) {
  vec3 t = texture(uImage, uv).rgb;
  return vec3(srgbToLinear(t.r), srgbToLinear(t.g), srgbToLinear(t.b));
}
float hash21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 cgOffset(vec3 hsl) {
  if (hsl.y <= 0.0) return vec3(0.0);
  vec3 col = hsv2rgb(vec3(hsl.x / 360.0, 1.0, 1.0)); // pure hue
  return (col - 0.5) * (hsl.y / 100.0) * 0.25;        // tint offset around gray
}
// Geometry: map frame UV -> source UV (straighten rotation + keystone). Identity at 0.
vec2 geoUV(vec2 uv) {
  uv -= 0.5;
  float ph = (uPerspectiveH / 100.0) * 0.6;
  float pv = (uPerspectiveV / 100.0) * 0.6;
  float w = 1.0 + ph * uv.x + pv * uv.y;
  uv /= max(0.2, w);
  float a = uStraighten * 0.0174532925;
  float ca = cos(a), sa = sin(a);
  uv = mat2(ca, sa, -sa, ca) * uv;
  return uv + 0.5;
}

void main() {
  vec2 baseUV = geoUV(vUv);
  vec3 s = texture(uImage, baseUV).rgb;
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

  // (4.5) Presence — texture/clarity (local contrast) + dehaze. Render-only, gated
  // so 0 = exact identity. Local contrast runs in luma space and rescales RGB to
  // preserve hue. Needs uTexel (the display proxy), so it no-ops in the equivalence gate.
  if ((uTexture != 0.0 || uClarity != 0.0) && uTexel.x > 0.0) {
    float Yp = luma(c);
    float yC = luma(linSample(baseUV));
    float yFine = 0.25 * (luma(linSample(baseUV + vec2(uTexel.x, 0.0))) + luma(linSample(baseUV - vec2(uTexel.x, 0.0))) +
                          luma(linSample(baseUV + vec2(0.0, uTexel.y))) + luma(linSample(baseUV - vec2(0.0, uTexel.y))));
    float fine = yC - yFine;
    float R = 3.0;
    float yCoarse = 0.125 * (
      luma(linSample(baseUV + vec2(R * uTexel.x, 0.0))) + luma(linSample(baseUV - vec2(R * uTexel.x, 0.0))) +
      luma(linSample(baseUV + vec2(0.0, R * uTexel.y))) + luma(linSample(baseUV - vec2(0.0, R * uTexel.y))) +
      luma(linSample(baseUV + R * uTexel)) + luma(linSample(baseUV - R * uTexel)) +
      luma(linSample(baseUV + vec2(R * uTexel.x, -R * uTexel.y))) + luma(linSample(baseUV + vec2(-R * uTexel.x, R * uTexel.y))));
    float coarse = yC - yCoarse;
    float mid = clamp(1.0 - abs(Yp - 0.5) * 2.0, 0.0, 1.0);
    float add = fine * (uTexture / 100.0) * 1.2 + coarse * (uClarity / 100.0) * mid * 1.6;
    float scale = Yp > 1e-4 ? clamp((Yp + add) / Yp, 0.0, 4.0) : 1.0;
    c *= scale;
  }
  // Dehaze — cut (or add) a low-contrast veil: contrast around a low pivot + saturation.
  if (uDehaze != 0.0) {
    float d = uDehaze / 100.0;
    c = (c - 0.3) * (1.0 + d * 0.45) + 0.3;
    float Yd = luma(c);
    c = vec3(Yd) + (c - vec3(Yd)) * (1.0 + d * 0.35);
    c = max(c - d * 0.02, vec3(0.0));
  }

  // (5) tone curve — identity in v1 (matches ops.ts)

  // (6) saturation + vibrance
  float Y2 = luma(c);
  float chroma = max(max(abs(c.r - Y2), abs(c.g - Y2)), abs(c.b - Y2));
  float sat = 1.0 + uSaturation / 100.0;
  float vib = 1.0 + (uVibrance / 100.0) * (1.0 - clamp(chroma * 2.0, 0.0, 1.0));
  float sfac = sat * vib;
  c = vec3(Y2) + (c - vec3(Y2)) * sfac;

  // (6.5) Color grading — tint shadows / midtones / highlights by luma region, plus a
  // per-region luminance push. Render-only, gated so 0 = exact identity.
  float cgSum = uCgSh.y + uCgMid.y + uCgHi.y + abs(uCgSh.z) + abs(uCgMid.z) + abs(uCgHi.z);
  if (cgSum > 0.0) {
    float Yg = clamp(luma(c), 0.0, 1.0);
    float pivot = 0.5 + (uCgBalance / 100.0) * 0.3;
    float shW = smoothstep(pivot, 0.0, Yg);
    float hiW = smoothstep(pivot, 1.0, Yg);
    float midW = max(0.0, 1.0 - shW - hiW);
    vec3 off = cgOffset(uCgSh) * shW + cgOffset(uCgMid) * midW + cgOffset(uCgHi) * hiW;
    float lum = (uCgSh.z * shW + uCgMid.z * midW + uCgHi.z * hiW) / 100.0 * 0.5;
    c = max(c + off, vec3(0.0)) * (1.0 + lum);
    c = max(c, vec3(0.0));
  }

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

  // (8) Detail & Effects — render-only, each gated so 0 = exact identity. The high-pass
  // is computed in source space: tone ops are mostly low-frequency, so the source's high
  // frequencies approximate the developed image's.
  // Sharpen — radius-scaled high-pass, detail emphasis, optional edge masking.
  if (uSharpen > 0.0 && uTexel.x > 0.0) {
    float rad = 1.0 + (uSharpenRadius / 100.0) * 2.5;
    vec2 ox = vec2(uTexel.x * rad, 0.0), oy = vec2(0.0, uTexel.y * rad);
    vec3 c0 = linSample(baseUV);
    vec3 blur = 0.25 * (linSample(baseUV + ox) + linSample(baseUV - ox) + linSample(baseUV + oy) + linSample(baseUV - oy));
    float gx = luma(linSample(baseUV + ox)) - luma(linSample(baseUV - ox));
    float gy = luma(linSample(baseUV + oy)) - luma(linSample(baseUV - oy));
    float mask = mix(1.0, smoothstep(0.0, 0.12, sqrt(gx * gx + gy * gy)), uSharpenMasking / 100.0);
    c += (c0 - blur) * (uSharpen / 100.0) * (1.5 + uSharpenDetail / 100.0) * mask;
  }
  // Luminance noise reduction — pull luma toward the neighborhood average.
  if (uNoiseReduction > 0.0 && uTexel.x > 0.0) {
    vec3 blur = 0.25 * (linSample(baseUV + vec2(uTexel.x, 0.0)) + linSample(baseUV - vec2(uTexel.x, 0.0)) +
                        linSample(baseUV + vec2(0.0, uTexel.y)) + linSample(baseUV - vec2(0.0, uTexel.y)));
    c += vec3(luma(blur) - luma(linSample(baseUV))) * (uNoiseReduction / 100.0);
  }
  // Color noise reduction — smooth chroma toward the neighborhood, keep luma.
  if (uColorNoiseReduction > 0.0 && uTexel.x > 0.0) {
    vec3 blur = 0.25 * (linSample(baseUV + vec2(uTexel.x, 0.0)) + linSample(baseUV - vec2(uTexel.x, 0.0)) +
                        linSample(baseUV + vec2(0.0, uTexel.y)) + linSample(baseUV - vec2(0.0, uTexel.y)));
    float yc = luma(c);
    c = vec3(yc) + mix(c - vec3(yc), blur - vec3(luma(blur)), (uColorNoiseReduction / 100.0) * 0.9);
  }

  // Vignette — midpoint (inner radius), feather (falloff), roundness (box <-> round).
  if (uVignette != 0.0) {
    vec2 d2 = abs(vUv - 0.5) * 2.0;
    float r = mix(max(d2.x, d2.y), length(vUv - 0.5) * 1.41421356, clamp(uVignetteRoundness / 200.0 + 0.5, 0.0, 1.0));
    float mp = uVignetteMidpoint / 100.0;
    float fth = 0.05 + (uVignetteFeather / 100.0) * 0.95;
    c *= max(0.0, 1.0 - (uVignette / 100.0) * smoothstep(mp, mp + fth, r));
  }

  // Film grain — monochrome, locked to source pixels so it's stable across zoom/export.
  // size scales the cell; roughness sharpens the noise distribution.
  if (uGrain > 0.0 && uTexel.x > 0.0) {
    float sz = 1.0 + (uGrainSize / 100.0) * 4.0;
    float n = hash21(floor(vUv / (uTexel * sz))) - 0.5;
    n = sign(n) * pow(abs(n) * 2.0, mix(1.0, 0.5, uGrainRoughness / 100.0)) * 0.5;
    c += vec3(n) * (uGrain / 100.0) * 0.12;
  }

  vec3 srgb = vec3(linearToSrgb(c.r), linearToSrgb(c.g), linearToSrgb(c.b));

  // (9) Tone curve — sample the baked LUT per channel. Gated so 0 = exact identity
  // (the LUT's 8-bit quantization must not perturb the equivalence gate).
  if (uCurveActive > 0.5) {
    srgb.r = texture(uCurve, vec2(srgb.r, 0.5)).r;
    srgb.g = texture(uCurve, vec2(srgb.g, 0.5)).g;
    srgb.b = texture(uCurve, vec2(srgb.b, 0.5)).b;
  }

  // (10) 3D LUT — trilinear lookup at the display-space color, blended by amount.
  // Scale coords to texel centers so the cube's endpoints map exactly.
  if (uLutActive > 0.5) {
    vec3 cc = clamp(srgb, 0.0, 1.0);
    vec3 lc = cc * ((uLutSize - 1.0) / uLutSize) + (0.5 / uLutSize);
    srgb = mix(srgb, texture(uLut, lc).rgb, uLutAmount / 100.0);
  }

  outColor = vec4(srgb, 1.0);
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

// The develop ops as closed forms in LINEAR RGB, fixed order (docs/ENGINE-SPEC.md).
// THIS IS THE SINGLE SOURCE OF TRUTH. The GLSL shader (engine/shaders) must mirror
// these exact forms; engine/fit.ts fits against this model. A CI equivalence test
// asserts shader(params) ~= applyParams(params) within ΔE epsilon (ARCHITECTURE §2.1).

import type { ControlParams, LinearRGB } from './types'
import { clamp } from './color'

const LR = 0.2126729
const LG = 0.7151522
const LB = 0.072175
const luma = (r: number, g: number, b: number): number => LR * r + LG * g + LB * b

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Apply the develop pipeline (ops 3-7) to one linear-RGB pixel. Pure, no clamping
 *  until the caller's output encode (linearToSrgb clamps). */
export function applyParams(rgb: LinearRGB, p: ControlParams): LinearRGB {
  let r = rgb[0]
  let g = rgb[1]
  let b = rgb[2]

  // (1) White balance — diagonal gain in linear RGB.
  //     +temp warms (R up, B down); +tint -> magenta (G down); -tint -> green (G up).
  const kt = p.temp / 100
  const ki = p.tint / 100
  const gr = Math.max(0, 1 + 0.3 * kt + 0.1 * ki)
  const gg = Math.max(0, 1 - 0.2 * ki)
  const gb = Math.max(0, 1 - 0.3 * kt + 0.1 * ki)
  r *= gr
  g *= gg
  b *= gb

  // (2) Exposure — EV multiply. ±100 -> ±2 EV.
  const m = Math.pow(2, (p.exposure / 100) * 2)
  r *= m
  g *= m
  b *= m

  // (3) Contrast — linear S around mid-gray pivot (0.18).
  const c = 1 + (p.contrast / 100) * 0.6
  r = (r - 0.18) * c + 0.18
  g = (g - 0.18) * c + 0.18
  b = (b - 0.18) * c + 0.18

  // (4) Tone regions — luminance-weighted gains (Highlights/Shadows/Whites/Blacks).
  const Y = clamp(luma(r, g, b), 0, 1)
  const toneGain =
    1 +
    0.5 * (p.highlights / 100) * smoothstep(0.5, 1.0, Y) +
    0.5 * (p.shadows / 100) * smoothstep(0.5, 0.0, Y) +
    0.5 * (p.whites / 100) * smoothstep(0.7, 1.0, Y) +
    0.5 * (p.blacks / 100) * smoothstep(0.3, 0.0, Y)
  r *= toneGain
  g *= toneGain
  b *= toneGain

  // (5) Tone curve (fitted) — identity in the v1 forward model; the fitted curve lands here later.

  // (6) Saturation + Vibrance — scale chroma about luma.
  const Y2 = luma(r, g, b)
  const chroma = Math.max(Math.abs(r - Y2), Math.abs(g - Y2), Math.abs(b - Y2))
  const sat = 1 + p.saturation / 100
  const vib = 1 + (p.vibrance / 100) * (1 - clamp(chroma * 2, 0, 1))
  const s = sat * vib
  r = Y2 + (r - Y2) * s
  g = Y2 + (g - Y2) * s
  b = Y2 + (b - Y2) * s

  return [r, g, b]
}

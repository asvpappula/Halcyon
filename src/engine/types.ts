// Core engine types. Framework-free (no React/DOM) so the engine is unit-testable
// headless and reusable inside Web Workers. See docs/ARCHITECTURE.md and docs/ENGINE-SPEC.md.

import { IDENTITY_CURVES, type CurveSet } from './curve'
import type { LutRef } from './lut'

/** Crop region in normalized image coordinates (0..1), top-left origin. null = full frame. */
export interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

/** Non-destructive develop controls. Values only, never pixels. UI ranges per DESIGN-SYSTEM. */
export interface ControlParams {
  exposure: number // -100..100  (maps to EV)
  contrast: number // -100..100
  highlights: number // -100..100
  shadows: number // -100..100
  whites: number // -100..100
  blacks: number // -100..100
  temp: number // -100..100  (blue<->yellow)
  tint: number // -100..100  (green<->magenta)
  vibrance: number // -100..100
  saturation: number // -100..100
  // Presence (render-only; the match fit never sets these). 0 = off.
  texture: number // -100..100  (fine local contrast)
  clarity: number // -100..100  (midtone local contrast)
  dehaze: number // -100..100  (veil removal / add)
  // Detail & Effects (render-only; the match fit never sets these). 0 = off.
  sharpen: number // 0..100  (unsharp-mask amount)
  noiseReduction: number // 0..100  (luminance smoothing)
  vignette: number // -100..100  (+ darkens edges, - lightens)
  grain: number // 0..100  (film grain intensity)
  crop: CropRect | null // geometry, not a develop slider; null = full frame
  // HSL / Color Mixer: 8 bands (Red, Orange, Yellow, Green, Aqua, Blue, Purple, Magenta),
  // each -100..100. Render-only (the match fit never sets these). null-safe default = zeros.
  hslHue: number[]
  hslSat: number[]
  hslLum: number[]
  // Tone curve: master (RGB) + per-channel point sets (render-only). null-safe via DEFAULT.
  curves: CurveSet
  // Imported 3D LUT reference + blend amount (render-only). null = no LUT.
  lut: LutRef | null
  // Color grading: per-region [hue 0..360, sat 0..100, lum -100..100] + balance (render-only).
  colorGrade: ColorGrade
}

/** 3-way color grading. Each region tuple is [hue 0..360, sat 0..100, lum -100..100]. */
export interface ColorGrade {
  sh: number[]
  mid: number[]
  hi: number[]
  balance: number // -100..100, shifts the shadow/highlight pivot
}
export const DEFAULT_COLOR_GRADE = (): ColorGrade => ({
  sh: [0, 0, 0],
  mid: [0, 0, 0],
  hi: [0, 0, 0],
  balance: 0,
})

export const HSL_BANDS = ['Red', 'Orange', 'Yellow', 'Green', 'Aqua', 'Blue', 'Purple', 'Magenta']

export const DEFAULT_PARAMS: ControlParams = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temp: 0,
  tint: 0,
  vibrance: 0,
  saturation: 0,
  texture: 0,
  clarity: 0,
  dehaze: 0,
  sharpen: 0,
  noiseReduction: 0,
  vignette: 0,
  grain: 0,
  crop: null,
  hslHue: [0, 0, 0, 0, 0, 0, 0, 0],
  hslSat: [0, 0, 0, 0, 0, 0, 0, 0],
  hslLum: [0, 0, 0, 0, 0, 0, 0, 0],
  curves: IDENTITY_CURVES(),
  lut: null,
  colorGrade: DEFAULT_COLOR_GRADE(),
}

/** The scalar numeric develop controls (excludes crop, HSL arrays, curves, LUT). */
export type DevelopKey = Exclude<
  keyof ControlParams,
  'crop' | 'hslHue' | 'hslSat' | 'hslLum' | 'curves' | 'lut' | 'colorGrade'
>

/** A linear-RGB pixel (0..1 nominal; may exceed 1 mid-pipeline before output encode). */
export type LinearRGB = [number, number, number]

/** Per-channel CIELAB statistics (L, a, b). */
export interface LabStats {
  mean: [number, number, number]
  std: [number, number, number]
}

// Core engine types. Framework-free (no React/DOM) so the engine is unit-testable
// headless and reusable inside Web Workers. See docs/ARCHITECTURE.md and docs/ENGINE-SPEC.md.

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
  crop: CropRect | null // geometry, not a develop slider; null = full frame
}

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
  crop: null,
}

/** The numeric develop controls only (excludes `crop`, which is geometry). */
export type DevelopKey = Exclude<keyof ControlParams, 'crop'>

/** A linear-RGB pixel (0..1 nominal; may exceed 1 mid-pipeline before output encode). */
export type LinearRGB = [number, number, number]

/** Per-channel CIELAB statistics (L, a, b). */
export interface LabStats {
  mean: [number, number, number]
  std: [number, number, number]
}

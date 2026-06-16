// Reference-match orchestration: turn reference image(s) into target Lab stats, then
// fit the active image to those stats, returning the editable controls + a strength.
// The fit only sets the 5 controls that map to Lab mean/std; the rest stay the user's.
// docs/ENGINE-SPEC.md.

import { fitMatch, matchStrength as strengthOf, averageStats } from './fit'
import { labStatsFromLinear, statsAfterParams } from './stats'
import { proxyPixels } from './proxy'
import type { ControlParams, LabStats, LinearRGB } from './types'

export type MatchParams = Pick<
  ControlParams,
  'exposure' | 'contrast' | 'temp' | 'tint' | 'saturation'
>

/** Robust-average target stats over N reference images (mood board). */
export function computeTargetStats(refs: ImageBitmap[]): LabStats {
  return averageStats(refs.map((b) => labStatsFromLinear(proxyPixels(b))))
}

export interface MatchResult {
  params: MatchParams
  strength: number
}

/** Fit pre-extracted proxy pixels to the target. Pure (no DOM) — runs on the main
 *  thread or inside the batch Web Worker. */
export function computeMatchFromProxy(px: LinearRGB[], target: LabStats): MatchResult {
  const fitted = fitMatch(px, target)
  const rendered = statsAfterParams(px, fitted)
  return {
    params: {
      exposure: fitted.exposure,
      contrast: fitted.contrast,
      temp: fitted.temp,
      tint: fitted.tint,
      saturation: fitted.saturation,
    },
    strength: strengthOf(rendered, target),
  }
}

/** Fit a single source image to the target. Per-image: callers fit EACH image to the
 *  SAME target (that is the batch normalization — see ARCHITECTURE §2). */
export function computeMatch(source: ImageBitmap, target: LabStats): MatchResult {
  return computeMatchFromProxy(proxyPixels(source), target)
}

/** Flatten proxy pixels to a transferable Float32Array (for posting to the worker). */
export function flattenProxy(px: LinearRGB[]): Float32Array {
  const flat = new Float32Array(px.length * 3)
  for (let i = 0; i < px.length; i++) {
    flat[i * 3] = px[i][0]
    flat[i * 3 + 1] = px[i][1]
    flat[i * 3 + 2] = px[i][2]
  }
  return flat
}

export function unflattenProxy(flat: Float32Array): LinearRGB[] {
  const n = flat.length / 3
  const px: LinearRGB[] = new Array(n)
  for (let i = 0; i < n; i++) px[i] = [flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]]
  return px
}

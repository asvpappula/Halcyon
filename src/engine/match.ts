// Reference-match orchestration: turn reference image(s) into target Lab stats, then
// fit the active image to those stats, returning the editable controls + a strength.
// The fit only sets the 5 controls that map to Lab mean/std; the rest stay the user's.
// docs/ENGINE-SPEC.md.

import { fitMatch, matchStrength as strengthOf, averageStats } from './fit'
import { labStatsFromLinear, statsAfterParams } from './stats'
import { proxyPixels } from './proxy'
import type { ControlParams, LabStats } from './types'

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

/** Fit a single source image to the target. Per-image: callers fit EACH image to the
 *  SAME target (that is the batch normalization — see ARCHITECTURE §2). */
export function computeMatch(source: ImageBitmap, target: LabStats): MatchResult {
  const px = proxyPixels(source)
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

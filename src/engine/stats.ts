// CIELAB statistics from a pixel set (a small proxy in practice). docs/ENGINE-SPEC.md.

import type { ControlParams, LabStats, LinearRGB } from './types'
import { linearRgbToLab } from './color'
import { applyParams } from './ops'

/** Mean + std of L, a, b over linear-RGB pixels. */
export function labStatsFromLinear(pixels: LinearRGB[]): LabStats {
  const n = pixels.length || 1
  const labs: [number, number, number][] = new Array(pixels.length)
  let sL = 0
  let sa = 0
  let sb = 0
  for (let i = 0; i < pixels.length; i++) {
    const lab = linearRgbToLab(pixels[i])
    labs[i] = lab
    sL += lab[0]
    sa += lab[1]
    sb += lab[2]
  }
  const mL = sL / n
  const ma = sa / n
  const mb = sb / n
  let vL = 0
  let va = 0
  let vb = 0
  for (let i = 0; i < labs.length; i++) {
    vL += (labs[i][0] - mL) ** 2
    va += (labs[i][1] - ma) ** 2
    vb += (labs[i][2] - mb) ** 2
  }
  return {
    mean: [mL, ma, mb],
    std: [Math.sqrt(vL / n), Math.sqrt(va / n), Math.sqrt(vb / n)],
  }
}

/** Lab stats of `pixels` after applying `p` — used by the fit's forward evaluation. */
export function statsAfterParams(pixels: LinearRGB[], p: ControlParams): LabStats {
  const out: LinearRGB[] = new Array(pixels.length)
  for (let i = 0; i < pixels.length; i++) out[i] = applyParams(pixels[i], p)
  return labStatsFromLinear(out)
}

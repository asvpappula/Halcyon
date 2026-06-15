// Reference-match fit: derive editable ControlParams that make the rendered image's
// Lab statistics approximate a target. Fits against the analytic forward model
// (engine/ops.ts) on a small proxy — NO GPU readback. docs/ENGINE-SPEC.md.

import { DEFAULT_PARAMS, type ControlParams, type LabStats, type LinearRGB } from './types'
import { clamp, deltaE2000, labToLinearRgb, linearRgbToLab } from './color'
import { statsAfterParams } from './stats'

/** Squared distance between two Lab stat sets (mean + std, all channels). */
function statDist(a: LabStats, b: LabStats): number {
  let d = 0
  for (let i = 0; i < 3; i++) {
    d += (a.mean[i] - b.mean[i]) ** 2 + (a.std[i] - b.std[i]) ** 2
  }
  return d
}

/** Golden-section 1D minimizer on [lo, hi]. */
function goldenMin(f: (x: number) => number, lo: number, hi: number, iters: number): number {
  const phi = (Math.sqrt(5) - 1) / 2
  let a = lo
  let b = hi
  let c = b - phi * (b - a)
  let d = a + phi * (b - a)
  let fc = f(c)
  let fd = f(d)
  for (let i = 0; i < iters; i++) {
    if (fc < fd) {
      b = d
      d = c
      fd = fc
      c = b - phi * (b - a)
      fc = f(c)
    } else {
      a = c
      c = d
      fc = fd
      d = a + phi * (b - a)
      fd = f(d)
    }
  }
  return (a + b) / 2
}

/** Fit ControlParams so the source's rendered Lab stats approach `target`.
 *  v1 fits the 5 controls that map cleanly to Lab mean/std; H/S/W/B/curve/vibrance
 *  stay at default and are the user's to tune. */
export function fitMatch(source: LinearRGB[], target: LabStats): ControlParams {
  const p: ControlParams = { ...DEFAULT_PARAMS }
  const order: (keyof ControlParams)[] = ['exposure', 'temp', 'tint', 'contrast', 'saturation']
  const lossAt = (key: keyof ControlParams, v: number): number => {
    const cand = { ...p, [key]: v }
    return statDist(statsAfterParams(source, cand), target)
  }
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const key of order) {
      p[key] = clamp(goldenMin((v) => lossAt(key, v), -100, 100, 16), -100, 100)
    }
  }
  return p
}

/** The ideal per-channel Lab affine (Reinhard) transfer — the fidelity reference. */
export function idealReinhard(rgb: LinearRGB, s: LabStats, t: LabStats): LinearRGB {
  const lab = linearRgbToLab(rgb)
  const out: [number, number, number] = [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    const sd = s.std[i] < 1e-4 ? 1e-4 : s.std[i]
    out[i] = (lab[i] - s.mean[i]) * (t.std[i] / sd) + t.mean[i]
  }
  return labToLinearRgb(out[0], out[1], out[2])
}

/** Robust mood-board target = average of N reference stat sets.
 *  v1: trimmed mean per channel (drop min+max when >=4 refs), else plain mean. */
export function averageStats(list: LabStats[]): LabStats {
  if (list.length === 0) throw new Error('averageStats: empty')
  if (list.length === 1) return list[0]
  const pick = (sel: (s: LabStats) => number[], i: number): number => {
    const vals = list.map((s) => sel(s)[i]).sort((x, y) => x - y)
    const trimmed = vals.length >= 4 ? vals.slice(1, -1) : vals
    return trimmed.reduce((a, b) => a + b, 0) / trimmed.length
  }
  return {
    mean: [pick((s) => s.mean, 0), pick((s) => s.mean, 1), pick((s) => s.mean, 2)],
    std: [pick((s) => s.std, 0), pick((s) => s.std, 1), pick((s) => s.std, 2)],
  }
}

/** Match strength 0..100 from how close the rendered mean lands to the target mean. */
export function matchStrength(rendered: LabStats, target: LabStats): number {
  const de = deltaE2000(
    rendered.mean[0],
    rendered.mean[1],
    rendered.mean[2],
    target.mean[0],
    target.mean[1],
    target.mean[2],
  )
  return clamp(Math.round(100 * (1 - de / 20)), 0, 100)
}

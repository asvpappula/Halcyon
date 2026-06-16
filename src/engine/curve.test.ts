import { describe, it, expect } from 'vitest'
import { IDENTITY_CURVES, isCurveActive, evalCurve, buildCurveLut, type CurvePoint } from './curve'

describe('tone curve', () => {
  it('identity set is inactive', () => {
    expect(isCurveActive(IDENTITY_CURVES())).toBe(false)
  })

  it('a moved point makes it active', () => {
    const c = IDENTITY_CURVES()
    c.rgb = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.6 },
      { x: 1, y: 1 },
    ]
    expect(isCurveActive(c)).toBe(true)
  })

  it('identity curve maps x→x', () => {
    const line: CurvePoint[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]
    for (const x of [0, 0.25, 0.5, 0.75, 1]) {
      expect(evalCurve(line, x)).toBeCloseTo(x, 5)
    }
  })

  it('is monotonic for an S-curve (no overshoot)', () => {
    const s: CurvePoint[] = [
      { x: 0, y: 0 },
      { x: 0.25, y: 0.15 },
      { x: 0.75, y: 0.85 },
      { x: 1, y: 1 },
    ]
    let prev = -1
    for (let i = 0; i <= 100; i++) {
      const y = evalCurve(s, i / 100)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(1)
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9) // non-decreasing
      prev = y
    }
  })

  it('lifts shadows when a low point is raised', () => {
    const lift: CurvePoint[] = [
      { x: 0, y: 0 },
      { x: 0.25, y: 0.4 },
      { x: 1, y: 1 },
    ]
    expect(evalCurve(lift, 0.25)).toBeCloseTo(0.4, 2)
    expect(evalCurve(lift, 0.25)).toBeGreaterThan(0.25)
  })

  it('builds a 256×4 identity LUT that is ~diagonal', () => {
    const lut = buildCurveLut(IDENTITY_CURVES())
    expect(lut.length).toBe(256 * 4)
    expect(lut[0]).toBe(0)
    expect(lut[128 * 4]).toBe(128)
    expect(lut[255 * 4]).toBe(255)
    expect(lut[255 * 4 + 3]).toBe(255) // alpha
  })

  it('master curve composes with per-channel in the LUT', () => {
    const c = IDENTITY_CURVES()
    // master brightens midtones; red channel left identity
    c.rgb = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.7 },
      { x: 1, y: 1 },
    ]
    const lut = buildCurveLut(c)
    expect(lut[128 * 4]).toBeGreaterThan(150) // mid input pushed up by master
  })
})

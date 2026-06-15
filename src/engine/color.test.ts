import { describe, it, expect } from 'vitest'
import { srgbToLinear, linearToSrgb, linearRgbToLab, labToLinearRgb, deltaE2000 } from './color'

describe('color', () => {
  it('sRGB <-> linear round-trips', () => {
    for (const c of [0, 0.04, 0.18, 0.5, 0.9, 1]) {
      expect(linearToSrgb(srgbToLinear(c))).toBeCloseTo(c, 5)
    }
  })

  it('linear RGB <-> Lab round-trips', () => {
    const colors: [number, number, number][] = [
      [0.18, 0.18, 0.18],
      [0.5, 0.2, 0.7],
      [0.9, 0.8, 0.1],
    ]
    for (const rgb of colors) {
      const lab = linearRgbToLab(rgb)
      const back = labToLinearRgb(lab[0], lab[1], lab[2])
      for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(rgb[i], 4)
    }
  })

  it('deltaE2000 identity is 0', () => {
    expect(deltaE2000(50, 10, -20, 50, 10, -20)).toBeCloseTo(0, 6)
  })

  it('deltaE2000 matches Sharma reference pairs', () => {
    // Canonical CIEDE2000 test data (Sharma, Wu, Dalal 2005).
    expect(deltaE2000(50, 2.6772, -79.7751, 50, 0, -82.7485)).toBeCloseTo(2.0425, 3)
    expect(deltaE2000(50, 3.1571, -77.2803, 50, 0, -82.7485)).toBeCloseTo(2.8615, 3)
    expect(deltaE2000(50, -1.3802, -84.2814, 50, 0, -82.7485)).toBeCloseTo(1.0, 3)
    expect(deltaE2000(60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387)).toBeCloseTo(1.2644, 3)
  })
})

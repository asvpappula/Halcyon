import { describe, it, expect } from 'vitest'
import { parseCube } from './lut'

// A minimal 2×2×2 identity-ish .cube (R fastest).
const CUBE_2 = `TITLE "tiny"
LUT_3D_SIZE 2
0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
`

describe('parseCube', () => {
  it('parses size and packs RGBA with R fastest', () => {
    const lut = parseCube(CUBE_2)
    expect(lut.size).toBe(2)
    expect(lut.data.length).toBe(2 * 2 * 2 * 4)
    // entry 0 = (0,0,0)
    expect([lut.data[0], lut.data[1], lut.data[2], lut.data[3]]).toEqual([0, 0, 0, 255])
    // entry 1 = (1,0,0) -> R fastest
    expect([lut.data[4], lut.data[5], lut.data[6]]).toEqual([255, 0, 0])
    // entry 7 = (1,1,1)
    expect([lut.data[28], lut.data[29], lut.data[30]]).toEqual([255, 255, 255])
  })

  it('ignores comments and blank lines', () => {
    const lut = parseCube('# a comment\n\nLUT_3D_SIZE 2\n' + CUBE_2.split('\n').slice(2).join('\n'))
    expect(lut.size).toBe(2)
  })

  it('rejects 1D LUTs', () => {
    expect(() => parseCube('LUT_1D_SIZE 16\n0 0 0\n1 1 1')).toThrow(/1D/)
  })

  it('rejects a data-count mismatch', () => {
    expect(() => parseCube('LUT_3D_SIZE 2\n0 0 0\n1 1 1')).toThrow(/mismatch/)
  })

  it('rejects a missing size', () => {
    expect(() => parseCube('0 0 0\n1 1 1')).toThrow(/SIZE/)
  })
})

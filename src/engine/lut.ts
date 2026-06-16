// .cube 3D LUT parsing → a packed RGBA volume for a WebGL2 sampler3D. We support
// 3D LUTs with a 0..1 domain (the common creative-LUT case). The .cube data order
// (R varies fastest) matches texImage3D's expected order (width fastest), so the
// packed array uploads directly. Render-only — never part of the match fit.

export interface Lut3D {
  size: number
  data: Uint8Array // size³ × 4 (RGBA), R fastest
}

/** A per-photo reference to an imported LUT + its blend amount (0..100). */
export interface LutRef {
  id: string
  amount: number
}

const clamp255 = (v: number): number => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255))

export function parseCube(text: string): Lut3D {
  let size = 0
  const triples: number[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const upper = line.toUpperCase()
    if (upper.startsWith('LUT_3D_SIZE')) {
      size = parseInt(line.split(/\s+/)[1], 10)
    } else if (upper.startsWith('LUT_1D_SIZE')) {
      throw new Error('1D LUTs are not supported — use a 3D .cube LUT.')
    } else if (
      upper.startsWith('TITLE') ||
      upper.startsWith('DOMAIN_') ||
      upper.startsWith('LUT_3D_INPUT_RANGE')
    ) {
      continue // metadata not needed for a 0..1-domain LUT
    } else {
      const parts = line.split(/\s+/).map(Number)
      if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
        triples.push(parts[0], parts[1], parts[2])
      }
    }
  }
  if (!Number.isFinite(size) || size < 2 || size > 64) {
    throw new Error('Invalid or missing LUT_3D_SIZE (expected 2–64).')
  }
  const entries = size * size * size
  if (triples.length !== entries * 3) {
    throw new Error(`LUT data mismatch: expected ${entries} rows, got ${Math.floor(triples.length / 3)}.`)
  }
  const data = new Uint8Array(entries * 4)
  for (let i = 0; i < entries; i++) {
    data[i * 4] = clamp255(triples[i * 3])
    data[i * 4 + 1] = clamp255(triples[i * 3 + 1])
    data[i * 4 + 2] = clamp255(triples[i * 3 + 2])
    data[i * 4 + 3] = 255
  }
  return { size, data }
}

// Tone curve: monotone-cubic interpolation of user control points, baked into a
// 256-entry LUT the shader samples. Master (RGB) curve composes with per-channel
// R/G/B curves: out = channelCurve(masterCurve(in)). Render-only (the fit never sets
// curves), so it lives only here + the shader, not in ops.ts. docs/FEATURES.md (P4 curve).

export interface CurvePoint {
  x: number // input level, 0..1
  y: number // output level, 0..1
}

export interface CurveSet {
  rgb: CurvePoint[] // master, applied to all channels first
  r: CurvePoint[]
  g: CurvePoint[]
  b: CurvePoint[]
}

const identity = (): CurvePoint[] => [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
]

export const IDENTITY_CURVES = (): CurveSet => ({
  rgb: identity(),
  r: identity(),
  g: identity(),
  b: identity(),
})

export function cloneCurves(c: CurveSet): CurveSet {
  return {
    rgb: c.rgb.map((p) => ({ ...p })),
    r: c.r.map((p) => ({ ...p })),
    g: c.g.map((p) => ({ ...p })),
    b: c.b.map((p) => ({ ...p })),
  }
}

const isIdentityChannel = (p: CurvePoint[]): boolean =>
  p.length === 2 && p[0].x === 0 && p[0].y === 0 && p[1].x === 1 && p[1].y === 1

/** True if any channel deviates from the straight identity line. */
export function isCurveActive(c: CurveSet | undefined): boolean {
  if (!c) return false
  return !(isIdentityChannel(c.rgb) && isIdentityChannel(c.r) && isIdentityChannel(c.g) && isIdentityChannel(c.b))
}

interface Prepared {
  xs: number[]
  ys: number[]
  ms: number[] // tangents (Fritsch–Carlson, monotone)
}

/** Precompute monotone-cubic tangents so a curve can be sampled cheaply 256×. */
function prepare(points: CurvePoint[]): Prepared {
  const pts = [...points].sort((a, b) => a.x - b.x)
  const n = pts.length
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  if (n < 2) return { xs, ys, ms: [0] }
  const d: number[] = [] // secant slopes
  for (let i = 0; i < n - 1; i++) {
    const h = xs[i + 1] - xs[i]
    d.push(h > 1e-9 ? (ys[i + 1] - ys[i]) / h : 0)
  }
  const ms: number[] = new Array(n)
  ms[0] = d[0]
  ms[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) ms[i] = (d[i - 1] + d[i]) / 2
  // Fritsch–Carlson: clamp tangents to keep the interpolant monotone (no overshoot).
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      ms[i] = 0
      ms[i + 1] = 0
    } else {
      const a = ms[i] / d[i]
      const b = ms[i + 1] / d[i]
      const s = a * a + b * b
      if (s > 9) {
        const t = 3 / Math.sqrt(s)
        ms[i] = t * a * d[i]
        ms[i + 1] = t * b * d[i]
      }
    }
  }
  return { xs, ys, ms }
}

function sample(p: Prepared, x: number): number {
  const { xs, ys, ms } = p
  const n = xs.length
  if (n === 0) return x
  if (n === 1 || x <= xs[0]) return clamp01(ys[0])
  if (x >= xs[n - 1]) return clamp01(ys[n - 1])
  let i = 0
  while (i < n - 1 && x > xs[i + 1]) i++
  const h = xs[i + 1] - xs[i]
  const t = h > 1e-9 ? (x - xs[i]) / h : 0
  const t2 = t * t
  const t3 = t2 * t
  const y =
    ys[i] * (2 * t3 - 3 * t2 + 1) +
    h * ms[i] * (t3 - 2 * t2 + t) +
    ys[i + 1] * (-2 * t3 + 3 * t2) +
    h * ms[i + 1] * (t3 - t2)
  return clamp01(y)
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Sample a single channel curve at x (0..1). Exposed for the editor's preview path. */
export function evalCurve(points: CurvePoint[], x: number): number {
  return sample(prepare(points), x)
}

/** Bake the composed curve set into a 256×1 RGBA LUT (master ∘ per-channel). */
export function buildCurveLut(c: CurveSet): Uint8Array {
  const master = prepare(c.rgb)
  const red = prepare(c.r)
  const green = prepare(c.g)
  const blue = prepare(c.b)
  const lut = new Uint8Array(256 * 4)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    const m = sample(master, t)
    lut[i * 4] = Math.round(sample(red, m) * 255)
    lut[i * 4 + 1] = Math.round(sample(green, m) * 255)
    lut[i * 4 + 2] = Math.round(sample(blue, m) * 255)
    lut[i * 4 + 3] = 255
  }
  return lut
}

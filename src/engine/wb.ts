// White-balance eyedropper solve. Given a sampled linear-RGB pixel the user marked as
// neutral, find temp/tint (-100..100) so the WB diagonal-gain model in ops.ts/shaders.ts
// drives that pixel to a gray (R==G==B). The model has exactly two degrees of freedom,
// so the two constraints (R==B, G==R) give an exact 2x2 linear solve.
//
//   gr = 1 + 0.3*kt + 0.1*ki   gg = 1 - 0.2*ki   gb = 1 - 0.3*kt + 0.1*ki   (kt=temp/100, ki=tint/100)

export function solveWhiteBalance(r: number, g: number, b: number): { temp: number; tint: number } {
  r = Math.max(1e-4, r)
  g = Math.max(1e-4, g)
  b = Math.max(1e-4, b)
  // (1) R==B:  0.3(r+b)·kt + 0.1(r-b)·ki = b - r
  // (2) G==R:  0.3r·kt + (0.1r + 0.2g)·ki = g - r
  const a1 = 0.3 * (r + b)
  const b1 = 0.1 * (r - b)
  const c1 = b - r
  const a2 = 0.3 * r
  const b2 = 0.1 * r + 0.2 * g
  const c2 = g - r
  const det = a1 * b2 - a2 * b1
  if (Math.abs(det) < 1e-6) return { temp: 0, tint: 0 }
  const kt = (c1 * b2 - c2 * b1) / det
  const ki = (a1 * c2 - a2 * c1) / det
  const clamp = (v: number) => Math.max(-100, Math.min(100, Math.round(v * 100)))
  return { temp: clamp(kt), tint: clamp(ki) }
}

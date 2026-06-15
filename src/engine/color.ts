// Color science: sRGB <-> linear <-> XYZ <-> CIELAB, and CIEDE2000.
// All matrices/constants are sRGB primaries with a D65 white point.
// This is reference (CPU) math; the GLSL shader mirrors the same transforms.

import type { LinearRGB } from './types'

export const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x

// --- sRGB gamma <-> linear (per channel, 0..1) ---
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
export function linearToSrgb(c: number): number {
  const x = clamp(c, 0, 1)
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
}

// --- linear sRGB <-> XYZ (D65) ---
export function linearRgbToXyz(r: number, g: number, b: number): [number, number, number] {
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ]
}
export function xyzToLinearRgb(x: number, y: number, z: number): LinearRGB {
  return [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ]
}

// D65 reference white (XYZ, Y normalized to 1)
const Xn = 0.95047
const Yn = 1.0
const Zn = 1.08883
const labF = (t: number): number =>
  t > 0.008856451679 ? Math.cbrt(t) : 7.787037037 * t + 16 / 116
const labFinv = (t: number): number => {
  const t3 = t * t * t
  return t3 > 0.008856451679 ? t3 : (t - 16 / 116) / 7.787037037
}

export function xyzToLab(x: number, y: number, z: number): [number, number, number] {
  const fx = labF(x / Xn)
  const fy = labF(y / Yn)
  const fz = labF(z / Zn)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}
export function labToXyz(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116
  const fx = fy + a / 500
  const fz = fy - b / 200
  return [Xn * labFinv(fx), Yn * labFinv(fy), Zn * labFinv(fz)]
}

/** Linear RGB (0..1) -> CIELAB. */
export function linearRgbToLab(rgb: LinearRGB): [number, number, number] {
  const [x, y, z] = linearRgbToXyz(rgb[0], rgb[1], rgb[2])
  return xyzToLab(x, y, z)
}
/** CIELAB -> linear RGB (may be out of gamut; caller clamps on output). */
export function labToLinearRgb(L: number, a: number, b: number): LinearRGB {
  const [x, y, z] = labToXyz(L, a, b)
  return xyzToLinearRgb(x, y, z)
}

// --- CIEDE2000 ---
const rad = (d: number): number => (d * Math.PI) / 180
const deg = (r: number): number => {
  let d = (r * 180) / Math.PI
  if (d < 0) d += 360
  return d
}

export function deltaE2000(
  L1: number,
  a1: number,
  b1: number,
  L2: number,
  a2: number,
  b2: number,
): number {
  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const Cbar = (C1 + C2) / 2
  const Cbar7 = Math.pow(Cbar, 7)
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))))
  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)
  const h1p = C1p === 0 ? 0 : deg(Math.atan2(b1, a1p))
  const h2p = C2p === 0 ? 0 : deg(Math.atan2(b2, a2p))

  const dLp = L2 - L1
  const dCp = C2p - C1p
  let dhp = 0
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p
    if (dhp > 180) dhp -= 360
    else if (dhp < -180) dhp += 360
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2))

  const Lbarp = (L1 + L2) / 2
  const Cbarp = (C1p + C2p) / 2
  let hbarp = h1p + h2p
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) {
      hbarp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2
    } else {
      hbarp = (h1p + h2p) / 2
    }
  }

  const T =
    1 -
    0.17 * Math.cos(rad(hbarp - 30)) +
    0.24 * Math.cos(rad(2 * hbarp)) +
    0.32 * Math.cos(rad(3 * hbarp + 6)) -
    0.2 * Math.cos(rad(4 * hbarp - 63))

  const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2))
  const Cbarp7 = Math.pow(Cbarp, 7)
  const Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + Math.pow(25, 7)))
  const Sl = 1 + (0.015 * Math.pow(Lbarp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2))
  const Sc = 1 + 0.045 * Cbarp
  const Sh = 1 + 0.015 * Cbarp * T
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc

  const kL = 1,
    kC = 1,
    kH = 1
  return Math.sqrt(
    Math.pow(dLp / (kL * Sl), 2) +
      Math.pow(dCp / (kC * Sc), 2) +
      Math.pow(dHp / (kH * Sh), 2) +
      Rt * (dCp / (kC * Sc)) * (dHp / (kH * Sh)),
  )
}

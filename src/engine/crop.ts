// Crop geometry helpers (pure). docs/FEATURES.md (P2 crop/aspect).

import type { CropRect } from './types'

/** A centered crop of the given target aspect (aspectW:aspectH) within an image. */
export function centeredCrop(
  imgW: number,
  imgH: number,
  aspectW: number,
  aspectH: number,
): CropRect {
  const imgA = imgW / imgH
  const targetA = aspectW / aspectH
  let w = 1
  let h = 1
  if (targetA > imgA) h = imgA / targetA // target wider than image -> limit height
  else w = targetA / imgA // taller/narrower -> limit width
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h }
}

/** Whether a crop is effectively the full frame (within epsilon). */
export function isFullFrame(c: CropRect | null): boolean {
  if (!c) return true
  return c.x < 1e-4 && c.y < 1e-4 && c.w > 1 - 1e-4 && c.h > 1 - 1e-4
}

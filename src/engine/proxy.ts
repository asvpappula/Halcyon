// Extract a small linear-RGB proxy from an image for stats/fit (NOT for display).
// Fit + stats run on this ~256px proxy, never full-res. docs/ARCHITECTURE.md §8.

import { srgbToLinear } from './color'
import type { LinearRGB } from './types'

export function proxyPixels(src: ImageBitmap, maxDim = 256): LinearRGB[] {
  const scale = Math.min(1, maxDim / Math.max(src.width, src.height))
  const w = Math.max(1, Math.round(src.width * scale))
  const h = Math.max(1, Math.round(src.height * scale))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D context unavailable for proxy extraction')
  ctx.drawImage(src, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data
  const n = w * h
  const px: LinearRGB[] = new Array(n)
  for (let i = 0; i < n; i++) {
    px[i] = [
      srgbToLinear(data[i * 4] / 255),
      srgbToLinear(data[i * 4 + 1] / 255),
      srgbToLinear(data[i * 4 + 2] / 255),
    ]
  }
  return px
}

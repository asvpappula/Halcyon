// Batch match Web Worker: runs the (expensive) coordinate-descent fit off the main
// thread so a large batch never freezes the UI. The main thread extracts the cheap
// 256px proxy (canvas/DOM) and posts the flattened pixels here; we run the pure fit
// and post back the fitted controls + strength. docs/ARCHITECTURE.md §2.

import { computeMatchFromProxy, unflattenProxy } from './match'
import type { LabStats } from './types'

interface Req {
  id: string
  flat: Float32Array
  target: LabStats
}

const post = (m: unknown) => (self as unknown as { postMessage: (m: unknown) => void }).postMessage(m)

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, flat, target } = e.data
  try {
    const { params, strength } = computeMatchFromProxy(unflattenProxy(flat), target)
    post({ id, params, strength })
  } catch {
    post({ id, error: true })
  }
}

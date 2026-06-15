// Share a "look" (the develop values, not the photo) as a compact URL token.
// v1 of the shareable link: open the URL -> the look is offered to apply to your own
// photo. A true before/after image URL needs the deferred Supabase storage.
// docs/FEATURES.md (P2 share link).

import type { ControlParams } from './types'
import type { DevelopKey } from './types'

const KEYS: DevelopKey[] = [
  'exposure',
  'contrast',
  'highlights',
  'shadows',
  'whites',
  'blacks',
  'temp',
  'tint',
  'vibrance',
  'saturation',
]

const b64urlEncode = (s: string): string =>
  btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64urlDecode = (s: string): string => atob(s.replace(/-/g, '+').replace(/_/g, '/'))

/** Encode the non-default numeric controls into a base64url token. */
export function encodeLook(p: ControlParams): string {
  const o: Record<string, number> = {}
  for (const k of KEYS) if (p[k] !== 0) o[k] = Math.round(p[k])
  return b64urlEncode(JSON.stringify(o))
}

/** Decode a token to a partial set of clamped controls, or null if invalid. */
export function decodeLook(token: string): Partial<ControlParams> | null {
  try {
    const o = JSON.parse(b64urlDecode(token)) as Record<string, unknown>
    if (!o || typeof o !== 'object') return null
    const out: Partial<ControlParams> = {}
    let any = false
    for (const k of KEYS) {
      const v = o[k]
      if (typeof v === 'number' && Number.isFinite(v)) {
        out[k] = Math.max(-100, Math.min(100, v))
        any = true
      }
    }
    return any ? out : null
  } catch {
    return null
  }
}

/** Build a shareable URL for the current look. */
export function buildLookUrl(p: ControlParams): string {
  const base = window.location.origin + window.location.pathname
  return `${base}#look=${encodeLook(p)}`
}

/** Read a look from the current URL hash, if present. */
export function readLookFromUrl(): Partial<ControlParams> | null {
  const m = window.location.hash.match(/look=([A-Za-z0-9\-_]+)/)
  return m ? decodeLook(m[1]) : null
}

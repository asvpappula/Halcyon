// User presets (localStorage) + built-in Halcyon looks. A preset is a saved set of
// develop values (a "look"), crop excluded. docs/FEATURES.md (P5 presets).

import type { ControlParams } from '../engine/types'

export interface Preset {
  id: string
  name: string
  params: Partial<ControlParams> // numeric develop values only (no crop)
  builtIn?: boolean
}

const KEY = 'halcyon.presets.v1'

export function loadUserPresets(): Preset[] {
  try {
    const s = localStorage.getItem(KEY)
    const arr = s ? (JSON.parse(s) as unknown) : []
    return Array.isArray(arr) ? (arr as Preset[]) : []
  } catch {
    return []
  }
}

export function saveUserPresets(presets: Preset[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(presets))
  } catch {
    /* storage unavailable / quota — presets just won't persist */
  }
}

// Built-in starter looks in the warm Halcyon aesthetic.
export const BUILTIN_PRESETS: Preset[] = [
  {
    id: 'builtin-warm-film',
    name: 'Warm Film',
    builtIn: true,
    params: { temp: 18, contrast: 12, highlights: -20, shadows: 14, saturation: -8, vibrance: 14 },
  },
  {
    id: 'builtin-cool-matte',
    name: 'Cool Matte',
    builtIn: true,
    params: { temp: -12, contrast: -10, blacks: 18, shadows: 12, saturation: -6 },
  },
  {
    id: 'builtin-punch',
    name: 'Punch',
    builtIn: true,
    params: { contrast: 28, vibrance: 24, blacks: -10, whites: 12 },
  },
  {
    id: 'builtin-soft-portrait',
    name: 'Soft Portrait',
    builtIn: true,
    params: { highlights: -16, shadows: 20, contrast: -6, vibrance: 10, temp: 6 },
  },
]

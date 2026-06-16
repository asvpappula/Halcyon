// Editor state: non-destructive params per photo, command-pattern undo/redo (scrubs
// coalesce to one command), debounced IndexedDB persistence. docs/ARCHITECTURE.md §3.

import { create } from 'zustand'
import {
  DEFAULT_PARAMS,
  type ControlParams,
  type CropRect,
  type DevelopKey,
  type LabStats,
} from '../engine/types'
import { DEFAULT_VIEW, type View } from '../engine/pipeline'
import {
  IDENTITY_CURVES,
  cloneCurves,
  isCurveActive,
  type CurvePoint,
  type CurveSet,
} from '../engine/curve'
import { computeMatch, computeTargetStats, type MatchParams } from '../engine/match'
import { persistEdit, persistPhoto, type PhotoRow } from '../persist/db'
import { loadUserPresets, saveUserPresets, type Preset } from '../persist/presets'

export interface PhotoMeta {
  id: string
  name: string
  width: number
  height: number
}

interface ImageEntry {
  bitmap: ImageBitmap
  width: number
  height: number
}

// Image bitmaps live outside the store (never serialized into state/persistence).
const images = new Map<string, ImageEntry>()
export const getImage = (id: string): ImageEntry | undefined => images.get(id)

// Reference images (for matching) also live outside the store.
const refImages = new Map<string, ImageBitmap>()
export const getRefImage = (id: string): ImageBitmap | undefined => refImages.get(id)

export interface ReferenceMeta {
  id: string
  name: string
  url: string // object URL for the thumbnail
}

// The scalar develop controls (crop is geometry via setCrop; the HSL arrays have
// their own actions). Mirrors DevelopKey so sliders/scrub stay strictly numeric.
export type ControlKey = DevelopKey

// Tone-curve channel: master (rgb) or an individual color channel.
export type CurveChannel = 'rgb' | 'r' | 'g' | 'b'

// HSL / color mixer: one of three channels within a band.
export type HslChannel = 'hue' | 'sat' | 'lum'
const HSL_KEY: Record<HslChannel, 'hslHue' | 'hslSat' | 'hslLum'> = {
  hue: 'hslHue',
  sat: 'hslSat',
  lum: 'hslLum',
}

interface Command {
  before: Partial<ControlParams>
  after: Partial<ControlParams>
}
interface History {
  stack: Command[]
  cursor: number
}

interface EditorState {
  photos: Record<string, PhotoMeta>
  order: string[]
  edits: Record<string, ControlParams>
  history: Record<string, History>
  activeId: string | null
  view: View
  storageOk: boolean
  references: ReferenceMeta[]
  targetStats: LabStats | null
  matchStrength: number | null
  pendingLook: Partial<ControlParams> | null
  selection: string[]
  batchProgress: { done: number; total: number } | null
  userPresets: Preset[]
  clipboard: Partial<ControlParams> | null

  addPhoto: (meta: PhotoMeta, bitmap: ImageBitmap, bytes?: Blob) => void
  setActive: (id: string) => void
  setControlLive: (key: ControlKey, value: number) => void
  beginScrub: (key: ControlKey) => void
  endScrub: (key: ControlKey) => void
  resetControl: (key: ControlKey) => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  setView: (v: Partial<View>) => void
  resetView: () => void
  setStorageOk: (ok: boolean) => void
  addReference: (id: string, name: string, bitmap: ImageBitmap, url: string) => void
  removeReference: (id: string) => void
  applyMatch: () => void
  setCrop: (crop: CropRect | null) => void
  applyLook: (look: Partial<ControlParams>) => void
  setPendingLook: (look: Partial<ControlParams> | null) => void
  toggleSelect: (id: string) => void
  selectAll: () => void
  clearSelect: () => void
  applyMatchToSelection: () => void
  savePreset: (name: string) => void
  deletePreset: (id: string) => void
  setHslLive: (band: number, channel: HslChannel, value: number) => void
  beginHslScrub: (band: number, channel: HslChannel) => void
  endHslScrub: (band: number, channel: HslChannel) => void
  resetHsl: () => void
  setCurve: (channel: CurveChannel, points: CurvePoint[]) => void
  beginCurveScrub: () => void
  endCurveScrub: () => void
  addCurvePoint: (channel: CurveChannel, x: number, y: number) => void
  removeCurvePoint: (channel: CurveChannel, index: number) => void
  resetCurves: () => void
  copySettings: () => void
  pasteSettings: () => void
  pasteToSelection: () => void
  hydrate: (photos: PhotoMeta[], edits: Record<string, ControlParams>, imgs: Map<string, ImageEntry>) => void
}

// debounced persistence per photo
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
function scheduleSave(id: string, params: ControlParams, storageOk: boolean): void {
  if (!storageOk) return
  const t = saveTimers.get(id)
  if (t) clearTimeout(t)
  saveTimers.set(
    id,
    setTimeout(() => {
      void persistEdit(id, params).catch(() => {})
      saveTimers.delete(id)
    }, 250),
  )
}

// Transient scrub capture (not in React state — must not trigger renders).
// Keyed by control so an end for a different key can't commit the wrong baseline,
// and so begin is idempotent across pointer+focus+keydown firing for one gesture.
let scrub: { key: ControlKey; before: number } | null = null

// Transient HSL scrub capture (parallel to `scrub`, but coalesces one band+channel
// gesture into a single command capturing that channel's whole 8-band array).
let hslScrub: { key: 'hslHue' | 'hslSat' | 'hslLum'; before: number[] } | null = null

// Transient tone-curve scrub: one point drag coalesces to a single command that
// captures the whole curve set (master + R/G/B) before/after.
let curveScrub: { before: CurveSet } | null = null

// Supersede an in-flight match/look animation when a new one starts (prevents two
// rAF loops fighting over the same photo's params).
let animToken = 0

// Numeric develop controls captured into a preset (crop excluded).
const PRESET_KEYS: DevelopKey[] = [
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

export const useEditor = create<EditorState>()((set, get) => ({
  photos: {},
  order: [],
  edits: {},
  history: {},
  activeId: null,
  view: { ...DEFAULT_VIEW },
  storageOk: true,
  references: [],
  targetStats: null,
  matchStrength: null,
  pendingLook: null,
  selection: [],
  batchProgress: null,
  userPresets: loadUserPresets(),
  clipboard: null,

  addPhoto: (meta, bitmap, bytes) => {
    images.set(meta.id, { bitmap, width: meta.width, height: meta.height })
    set((s) => ({
      photos: { ...s.photos, [meta.id]: meta },
      order: s.order.includes(meta.id) ? s.order : [...s.order, meta.id],
      edits: { ...s.edits, [meta.id]: s.edits[meta.id] ?? { ...DEFAULT_PARAMS } },
      history: { ...s.history, [meta.id]: s.history[meta.id] ?? { stack: [], cursor: 0 } },
      activeId: s.activeId ?? meta.id,
      view: s.activeId ? s.view : { ...DEFAULT_VIEW },
    }))
    if (bytes && get().storageOk) {
      const row: PhotoRow = { ...meta, createdAt: Date.now() }
      void persistPhoto(row, bytes).catch(() => {})
    }
  },

  setActive: (id) => {
    scrub = null // drop any pending scrub so it can't commit onto the new photo
    hslScrub = null
    curveScrub = null
    set({ activeId: id, view: { ...DEFAULT_VIEW } })
  },

  setControlLive: (key, value) => {
    const { activeId, edits, storageOk } = get()
    if (!activeId) return
    const next = { ...edits[activeId], [key]: value }
    set({ edits: { ...edits, [activeId]: next } })
    scheduleSave(activeId, next, storageOk)
  },

  beginScrub: (key) => {
    const { activeId, edits } = get()
    if (!activeId) return
    if (scrub && scrub.key === key) return // idempotent for one gesture
    animToken++ // grabbing a slider cancels any in-flight match animation (no race)
    scrub = { key, before: edits[activeId][key] }
  },

  endScrub: (key) => {
    const { activeId, edits } = get()
    if (!activeId || !scrub || scrub.key !== key) return
    const before = scrub.before
    const after = edits[activeId][key]
    scrub = null
    if (after !== before) pushCommand(set, get, activeId, { [key]: before }, { [key]: after })
  },

  resetControl: (key) => {
    const { activeId, edits } = get()
    if (!activeId) return
    const before = edits[activeId][key]
    const def = DEFAULT_PARAMS[key]
    if (before === def) return
    const next = { ...edits[activeId], [key]: def }
    set({ edits: { ...edits, [activeId]: next } })
    pushCommand(set, get, activeId, { [key]: before }, { [key]: def })
  },

  undo: () => {
    const { activeId, history, edits, storageOk } = get()
    if (!activeId) return
    const h = history[activeId]
    if (!h || h.cursor === 0) return
    const cmd = h.stack[h.cursor - 1]
    const next = { ...edits[activeId], ...cmd.before }
    set({
      edits: { ...edits, [activeId]: next },
      history: { ...history, [activeId]: { stack: h.stack, cursor: h.cursor - 1 } },
    })
    scheduleSave(activeId, next, storageOk)
  },

  redo: () => {
    const { activeId, history, edits, storageOk } = get()
    if (!activeId) return
    const h = history[activeId]
    if (!h || h.cursor >= h.stack.length) return
    const cmd = h.stack[h.cursor]
    const next = { ...edits[activeId], ...cmd.after }
    set({
      edits: { ...edits, [activeId]: next },
      history: { ...history, [activeId]: { stack: h.stack, cursor: h.cursor + 1 } },
    })
    scheduleSave(activeId, next, storageOk)
  },

  canUndo: () => {
    const { activeId, history } = get()
    return !!activeId && !!history[activeId] && history[activeId].cursor > 0
  },
  canRedo: () => {
    const { activeId, history } = get()
    return !!activeId && !!history[activeId] && history[activeId].cursor < history[activeId].stack.length
  },

  setView: (v) => set((s) => ({ view: { ...s.view, ...v } })),
  resetView: () => set({ view: { ...DEFAULT_VIEW } }),
  setStorageOk: (ok) => set({ storageOk: ok }),

  addReference: (id, name, bitmap, url) => {
    refImages.set(id, bitmap)
    set((s) => {
      const references = [...s.references, { id, name, url }]
      const bitmaps = references.map((r) => refImages.get(r.id)).filter((b): b is ImageBitmap => !!b)
      return { references, targetStats: computeTargetStats(bitmaps) }
    })
  },

  removeReference: (id) => {
    const url = get().references.find((r) => r.id === id)?.url
    if (url) URL.revokeObjectURL(url)
    refImages.get(id)?.close() // release the decoded bitmap (avoid leak)
    refImages.delete(id)
    set((s) => {
      const references = s.references.filter((r) => r.id !== id)
      const bitmaps = references.map((r) => refImages.get(r.id)).filter((b): b is ImageBitmap => !!b)
      return {
        references,
        targetStats: bitmaps.length ? computeTargetStats(bitmaps) : null,
        matchStrength: bitmaps.length ? get().matchStrength : null,
      }
    })
  },

  applyMatch: () => {
    const { activeId, targetStats, edits } = get()
    if (!activeId || !targetStats) return
    const img = getImage(activeId)
    if (!img) return
    const { params: fitted, strength } = computeMatch(img.bitmap, targetStats)
    const before: Partial<ControlParams> = {}
    const after: Partial<ControlParams> = {}
    ;(Object.keys(fitted) as (keyof MatchParams)[]).forEach((k) => {
      before[k] = edits[activeId][k]
      after[k] = fitted[k]
    })
    set({ matchStrength: strength })
    animateMatch(set, get, activeId, before, after)
  },

  setCrop: (crop) => {
    const { activeId, edits } = get()
    if (!activeId) return
    const before = edits[activeId].crop
    const next = { ...edits[activeId], crop }
    set({ edits: { ...edits, [activeId]: next } })
    pushCommand(set, get, activeId, { crop: before }, { crop })
  },

  applyLook: (look) => {
    const { activeId, edits } = get()
    if (!activeId) return
    const keys = Object.keys(look) as DevelopKey[]
    if (keys.length === 0) {
      set({ pendingLook: null })
      return
    }
    const before: Partial<ControlParams> = {}
    const after: Partial<ControlParams> = {}
    for (const k of keys) {
      before[k] = edits[activeId][k]
      after[k] = look[k] as number
    }
    set({ pendingLook: null })
    animateMatch(set, get, activeId, before, after) // same signature fill-in as a match
  },

  setPendingLook: (look) => set({ pendingLook: look }),

  toggleSelect: (id) =>
    set((s) => ({
      selection: s.selection.includes(id)
        ? s.selection.filter((x) => x !== id)
        : [...s.selection, id],
    })),
  selectAll: () => set((s) => ({ selection: [...s.order] })),
  clearSelect: () => set({ selection: [] }),

  // Apply the matched look to every selected photo, fitting EACH to the SAME target
  // (per-image normalization). Chunked + yielding so the UI stays responsive; one undo
  // command per photo. (Worker-offloading for very large batches is a perf follow-up.)
  applyMatchToSelection: () => {
    const start = get()
    if (!start.targetStats || start.selection.length === 0 || start.batchProgress) return
    const ids = [...start.selection]
    const target = start.targetStats
    animToken++ // cancel any in-flight match animation so it can't overwrite batch results
    set({ batchProgress: { done: 0, total: ids.length } })
    void (async () => {
      try {
      for (let i = 0; i < ids.length; i++) {
        const pid = ids[i]
        const img = getImage(pid)
        const cur = get().edits[pid]
        if (img && cur) {
          try {
            const { params: fitted } = computeMatch(img.bitmap, target)
            const before: Partial<ControlParams> = {}
            const after: Partial<ControlParams> = {}
            ;(Object.keys(fitted) as (keyof MatchParams)[]).forEach((k) => {
              before[k] = cur[k]
              after[k] = Math.round(fitted[k]) // batch sets directly (no animation), so round here
            })
            const edits = get().edits
            set({ edits: { ...edits, [pid]: { ...edits[pid], ...after } } })
            pushCommand(set, get, pid, before, after)
          } catch {
            /* skip an image that fails to fit; continue the batch */
          }
        }
        set({ batchProgress: { done: i + 1, total: ids.length } })
        await new Promise((r) => setTimeout(r, 0)) // yield to keep the UI responsive
      }
      } finally {
        set({ batchProgress: null }) // never leave the progress guard stuck
      }
    })()
  },

  savePreset: (name) => {
    const { activeId, edits, userPresets } = get()
    if (!activeId) return
    const cur = edits[activeId]
    const params: Partial<ControlParams> = {}
    for (const k of PRESET_KEYS) if (cur[k] !== 0) params[k] = cur[k]
    const preset: Preset = { id: crypto.randomUUID(), name: name.trim() || 'Untitled', params }
    const next = [...userPresets, preset]
    set({ userPresets: next })
    saveUserPresets(next)
  },

  deletePreset: (id) => {
    const next = get().userPresets.filter((p) => p.id !== id)
    set({ userPresets: next })
    saveUserPresets(next)
  },

  // HSL / color mixer: update one band's value within a channel. Writes a NEW array
  // (never mutates) so history baselines and referential equality stay intact.
  setHslLive: (band, channel, value) => {
    const { activeId, edits, storageOk } = get()
    if (!activeId) return
    const key = HSL_KEY[channel]
    const arr = (edits[activeId][key] ?? DEFAULT_PARAMS[key]).slice()
    arr[band] = value
    const next = { ...edits[activeId], [key]: arr }
    set({ edits: { ...edits, [activeId]: next } })
    scheduleSave(activeId, next, storageOk)
  },

  beginHslScrub: (_band, channel) => {
    const { activeId, edits } = get()
    if (!activeId) return
    const key = HSL_KEY[channel]
    if (hslScrub && hslScrub.key === key) return // idempotent within one gesture
    animToken++ // grabbing an HSL slider cancels any in-flight match animation
    hslScrub = { key, before: (edits[activeId][key] ?? DEFAULT_PARAMS[key]).slice() }
  },

  endHslScrub: (_band, channel) => {
    const { activeId, edits } = get()
    const key = HSL_KEY[channel]
    if (!activeId || !hslScrub || hslScrub.key !== key) return
    const before = hslScrub.before
    const after = (edits[activeId][key] ?? DEFAULT_PARAMS[key]).slice()
    hslScrub = null
    if (!arraysEqual(before, after)) {
      pushCommand(set, get, activeId, { [key]: before }, { [key]: after })
    }
  },

  // Reset the whole color mixer (all 24 values) in one undoable command.
  resetHsl: () => {
    const { activeId, edits } = get()
    if (!activeId) return
    const cur = edits[activeId]
    const before: Partial<ControlParams> = {}
    const after: Partial<ControlParams> = {}
    let changed = false
    for (const key of ['hslHue', 'hslSat', 'hslLum'] as const) {
      const arr = cur[key] ?? DEFAULT_PARAMS[key]
      if (arr.some((v) => v !== 0)) {
        before[key] = arr.slice()
        after[key] = [0, 0, 0, 0, 0, 0, 0, 0]
        changed = true
      }
    }
    if (!changed) return
    set({ edits: { ...edits, [activeId]: { ...cur, ...after } } })
    pushCommand(set, get, activeId, before, after)
  },

  // Tone curve: live-update one channel's points (no history) while dragging.
  setCurve: (channel, points) => {
    const { activeId, edits, storageOk } = get()
    if (!activeId) return
    const cur = edits[activeId].curves ?? IDENTITY_CURVES()
    const next = { ...edits[activeId], curves: { ...cur, [channel]: points } }
    set({ edits: { ...edits, [activeId]: next } })
    scheduleSave(activeId, next, storageOk)
  },

  beginCurveScrub: () => {
    const { activeId, edits } = get()
    if (!activeId || curveScrub) return
    animToken++ // grabbing a curve point cancels any in-flight match animation
    curveScrub = { before: cloneCurves(edits[activeId].curves ?? IDENTITY_CURVES()) }
  },

  endCurveScrub: () => {
    const { activeId, edits } = get()
    if (!activeId || !curveScrub) return
    const before = curveScrub.before
    const after = edits[activeId].curves ?? IDENTITY_CURVES()
    curveScrub = null
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      pushCommand(set, get, activeId, { curves: before }, { curves: cloneCurves(after) })
    }
  },

  // Add a point (commits immediately) — keeps the channel sorted by x.
  addCurvePoint: (channel, x, y) => {
    const { activeId, edits } = get()
    if (!activeId) return
    const cur = edits[activeId].curves ?? IDENTITY_CURVES()
    const before = cloneCurves(cur)
    const pts = [...cur[channel], { x, y }].sort((a, b) => a.x - b.x)
    const next = { ...cur, [channel]: pts }
    set({ edits: { ...edits, [activeId]: { ...edits[activeId], curves: next } } })
    pushCommand(set, get, activeId, { curves: before }, { curves: cloneCurves(next) })
  },

  // Remove an interior point (endpoints are kept to anchor black/white).
  removeCurvePoint: (channel, index) => {
    const { activeId, edits } = get()
    if (!activeId) return
    const cur = edits[activeId].curves ?? IDENTITY_CURVES()
    const pts = cur[channel]
    if (index <= 0 || index >= pts.length - 1) return
    const before = cloneCurves(cur)
    const next = { ...cur, [channel]: pts.filter((_, i) => i !== index) }
    set({ edits: { ...edits, [activeId]: { ...edits[activeId], curves: next } } })
    pushCommand(set, get, activeId, { curves: before }, { curves: cloneCurves(next) })
  },

  resetCurves: () => {
    const { activeId, edits } = get()
    if (!activeId) return
    const cur = edits[activeId].curves
    if (!isCurveActive(cur)) return
    const before = cloneCurves(cur ?? IDENTITY_CURVES())
    const next = IDENTITY_CURVES()
    set({ edits: { ...edits, [activeId]: { ...edits[activeId], curves: next } } })
    pushCommand(set, get, activeId, { curves: before }, { curves: next })
  },

  // Copy the active photo's full look (every develop field except crop) to the clipboard.
  copySettings: () => {
    const { activeId, edits } = get()
    if (!activeId) return
    set({ clipboard: snapshotLook(edits[activeId]) })
  },

  // Paste the clipboard look onto the active photo (one undo command).
  pasteSettings: () => {
    const { activeId, clipboard } = get()
    if (!activeId || !clipboard) return
    pasteClip(set, get, activeId, clipboard)
  },

  // Paste the clipboard look onto every selected photo (one command each).
  pasteToSelection: () => {
    const { selection, clipboard } = get()
    if (!clipboard || selection.length === 0) return
    for (const id of selection) pasteClip(set, get, id, clipboard)
  },

  hydrate: (photos, edits, imgs) => {
    imgs.forEach((v, k) => images.set(k, v))
    // Merge, don't replace: a photo imported during the async load must survive.
    set((s) => {
      const photoMap = { ...s.photos }
      const histMap = { ...s.history }
      const editMap = { ...s.edits }
      const order = [...s.order]
      for (const p of photos) {
        if (photoMap[p.id]) continue
        photoMap[p.id] = p
        histMap[p.id] = { stack: [], cursor: 0 }
        // Backfill DEFAULT for any keys an older persisted edit predates (e.g. HSL arrays).
        editMap[p.id] = { ...DEFAULT_PARAMS, ...edits[p.id] }
        order.push(p.id)
      }
      return {
        photos: photoMap,
        order,
        edits: editMap,
        history: histMap,
        activeId: s.activeId ?? order[0] ?? null,
        view: s.activeId ? s.view : { ...DEFAULT_VIEW },
      }
    })
  },
}))

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

// Snapshot a photo's full look (every develop field except crop), deep-cloning the
// structured fields so the clipboard stays independent of further edits.
function snapshotLook(p: ControlParams): Partial<ControlParams> {
  const { crop: _crop, curves, hslHue, hslSat, hslLum, ...scalars } = p
  return {
    ...scalars,
    curves: cloneCurves(curves ?? IDENTITY_CURVES()),
    hslHue: [...(hslHue ?? [])],
    hslSat: [...(hslSat ?? [])],
    hslLum: [...(hslLum ?? [])],
  }
}

function cloneVal<K extends keyof ControlParams>(k: K, v: ControlParams[K]): ControlParams[K] {
  if (k === 'curves') return cloneCurves(v as CurveSet) as ControlParams[K]
  if (Array.isArray(v)) return [...v] as unknown as ControlParams[K]
  return v
}

// Paste a clipboard look onto one photo as a single undo command.
function pasteClip(
  set: (partial: Partial<EditorState>) => void,
  get: () => EditorState,
  id: string,
  clip: Partial<ControlParams>,
): void {
  const cur = get().edits[id]
  if (!cur) return
  const keys = Object.keys(clip) as (keyof ControlParams)[]
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  for (const k of keys) {
    before[k] = cloneVal(k, cur[k])
    after[k] = cloneVal(k, clip[k] as ControlParams[typeof k])
  }
  set({ edits: { ...get().edits, [id]: { ...cur, ...after } } })
  pushCommand(set, get, id, before as Partial<ControlParams>, after as Partial<ControlParams>)
}

function pushCommand(
  set: (partial: Partial<EditorState>) => void,
  get: () => EditorState,
  id: string,
  before: Partial<ControlParams>,
  after: Partial<ControlParams>,
): void {
  const { history, edits, storageOk } = get()
  const h = history[id] ?? { stack: [], cursor: 0 }
  const stack = h.stack.slice(0, h.cursor)
  stack.push({ before, after })
  set({ history: { ...history, [id]: { stack, cursor: stack.length } } })
  scheduleSave(id, edits[id], storageOk)
}

/** Flush debounced edit saves immediately — call on tab hide/close so a scrub that
 *  ended <250ms before close isn't lost. */
export function flushPendingSaves(): void {
  const { edits, storageOk } = useEditor.getState()
  if (!storageOk) return
  saveTimers.forEach((t, id) => {
    clearTimeout(t)
    if (edits[id]) void persistEdit(id, edits[id]).catch(() => {})
  })
  saveTimers.clear()
}

// The signature moment: animate the fitted controls from their current values to the
// match result (staggered ease-out), so the user watches the look become real, editable
// sliders. Commits ONE grouped command at the end. Respects prefers-reduced-motion.
function animateMatch(
  set: (partial: Partial<EditorState>) => void,
  get: () => EditorState,
  id: string,
  before: Partial<ControlParams>,
  after: Partial<ControlParams>,
): void {
  const keys = Object.keys(after) as DevelopKey[]
  const myToken = ++animToken // supersede any animation already running
  const commit = () => pushCommand(set, get, id, before, after)
  const reduce =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce) {
    const { edits } = get()
    set({ edits: { ...edits, [id]: { ...edits[id], ...after } } })
    commit()
    return
  }
  const DUR = 450
  const STAGGER = 30
  const t0 = performance.now()
  const tick = (now: number): void => {
    if (myToken !== animToken) return // a newer match/look apply superseded this one
    const t = now - t0
    const { edits, activeId } = get()
    if (activeId !== id) return // photo switched mid-animation: abort
    const next = { ...edits[id] }
    let done = true
    keys.forEach((k, i) => {
      const local = Math.max(0, Math.min(1, (t - i * STAGGER) / DUR))
      const e = 1 - Math.pow(1 - local, 3)
      const b = before[k] as number
      const a = after[k] as number
      next[k] = Math.round(b + (a - b) * e)
      if (local < 1) done = false
    })
    set({ edits: { ...edits, [id]: next } })
    if (done) commit()
    else requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

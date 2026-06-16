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

// Numeric develop controls only (crop is geometry, edited via setCrop, not a slider).
export type ControlKey = Exclude<keyof ControlParams, 'crop'>

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
        editMap[p.id] = edits[p.id] ?? { ...DEFAULT_PARAMS }
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

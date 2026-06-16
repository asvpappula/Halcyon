import { useEffect, useState } from 'react'
import { Editor } from './ui/Editor'
import { Toaster } from './ui/Toaster'
import { useEditor, flushPendingSaves, type PhotoMeta } from './store/editor'
import { loadAll, storageAvailable } from './persist/db'
import { readLookFromUrl } from './engine/look'
import { DEFAULT_PARAMS, type ControlParams } from './engine/types'

// Module-level guard: load persisted data exactly once, even under StrictMode's
// mount→unmount→mount (otherwise every photo decodes twice and the first set leaks).
let didLoad = false

export default function App() {
  const hydrate = useEditor((s) => s.hydrate)
  const setStorageOk = useEditor((s) => s.setStorageOk)
  const [dev, setDev] = useState<string | null>(null)

  // Equivalence gate (DEV only): the shader must match the forward model (ARCHITECTURE §2.1).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    // DEV-only QA hook so the develop loop can be driven headlessly.
    ;(window as unknown as Record<string, unknown>).__editor = useEditor
    void import('./engine/equivalence').then(({ runEquivalenceCheck }) => {
      try {
        const r = runEquivalenceCheck()
        const msg = `equivalence ${r.pass ? 'PASS' : 'FAIL'} · median ΔE ${r.median.toFixed(3)} · max ${r.max.toFixed(3)}`
        ;(r.pass ? console.info : console.error)('[halcyon] ' + msg)
        setDev(msg)
      } catch (e) {
        console.warn('[halcyon] equivalence check skipped:', (e as Error).message)
      }
    })
  }, [])

  // Restore persisted photos + edits on load (once, even under StrictMode).
  useEffect(() => {
    if (didLoad) return
    didLoad = true
    void (async () => {
      const ok = await storageAvailable()
      if (!ok) {
        setStorageOk(false)
        return
      }
      try {
        const { photos, edits, blobs } = await loadAll()
        if (photos.length === 0) return
        const blobMap = new Map(blobs.map((b) => [b.id, b.bytes]))
        const imgs = new Map<string, { bitmap: ImageBitmap; width: number; height: number }>()
        const metas: PhotoMeta[] = []
        const editMap: Record<string, ControlParams> = {}
        for (const p of photos) {
          const bytes = blobMap.get(p.id)
          if (!bytes) continue
          try {
            const bitmap = await createImageBitmap(bytes, { imageOrientation: 'from-image' })
            imgs.set(p.id, { bitmap, width: p.width, height: p.height })
            metas.push({ id: p.id, name: p.name, width: p.width, height: p.height })
          } catch {
            /* skip unreadable blob */
          }
        }
        for (const e of edits) editMap[e.photoId] = e.params ?? { ...DEFAULT_PARAMS }
        if (metas.length) hydrate(metas, editMap, imgs)
      } catch (e) {
        console.warn('[halcyon] load failed:', (e as Error).message)
      }
    })()
  }, [hydrate, setStorageOk])

  // Flush debounced saves when the tab is hidden/closed.
  useEffect(() => {
    const flush = () => flushPendingSaves()
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  // A shared look in the URL becomes a pending offer to apply.
  useEffect(() => {
    const look = readLookFromUrl()
    if (look) useEditor.getState().setPendingLook(look)
  }, [])

  return (
    <div className="h-full">
      <Editor />
      <Toaster />
      {dev && (
        <div className="tnum pointer-events-none fixed bottom-2 left-2 z-50 rounded bg-raised px-2 py-1 text-[10px] text-fg-faint">
          {dev}
        </div>
      )}
    </div>
  )
}

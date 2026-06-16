import { useEffect, useRef, useState } from 'react'
import { zipSync } from 'fflate'
import { useEditor, getImage, getLutData } from '../store/editor'
import { exportPhoto, downloadBlob, type ExportFormat, type ExportOptions } from '../engine/export'

const SIZES: { label: string; maxEdge?: number }[] = [
  { label: 'Original' },
  { label: '2048px', maxEdge: 2048 },
  { label: '1080px', maxEdge: 1080 },
]
const FORMATS: { label: string; value: ExportFormat; ext: string }[] = [
  { label: 'JPEG', value: 'image/jpeg', ext: 'jpg' },
  { label: 'PNG', value: 'image/png', ext: 'png' },
  { label: 'WebP', value: 'image/webp', ext: 'webp' },
]

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const activeId = useEditor((s) => s.activeId)
  const photos = useEditor((s) => s.photos)
  const edits = useEditor((s) => s.edits)
  const selection = useEditor((s) => s.selection)
  const [fmt, setFmt] = useState<ExportFormat>('image/jpeg')
  const [quality, setQuality] = useState(92)
  const [sizeIdx, setSizeIdx] = useState(0)
  const [scope, setScope] = useState<'one' | 'selected'>('one')
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    cardRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const fmtInfo = FORMATS.find((f) => f.value === fmt)!
  const lossy = fmt !== 'image/png'
  const pct = (quality - 50) / 0.5

  const raf = () => new Promise((r) => requestAnimationFrame(() => r(null)))
  const optsFor = (id: string): ExportOptions => {
    const lr = edits[id].lut
    const ld = lr ? getLutData(lr.id) : undefined
    return {
      format: fmt,
      quality: quality / 100,
      maxEdge: SIZES[sizeIdx].maxEdge,
      lut: lr && ld ? { size: ld.size, data: ld.data, amount: lr.amount } : null,
    }
  }

  const doExport = async () => {
    setBusy(true)
    setErr(null)
    await raf() // let the busy state paint
    try {
      if (scope === 'selected' && selection.length) {
        const files: Record<string, Uint8Array> = {}
        const used = new Set<string>()
        for (let i = 0; i < selection.length; i++) {
          const id = selection[i]
          const img = getImage(id)
          if (!img) continue
          setProg({ done: i, total: selection.length })
          await raf()
          const blob = await exportPhoto(img.bitmap, edits[id], optsFor(id))
          const base = (photos[id]?.name || id).replace(/\.[^.]+$/, '')
          let name = `${base}-halcyon.${fmtInfo.ext}`
          for (let k = 1; used.has(name); k++) name = `${base}-halcyon-${k}.${fmtInfo.ext}`
          used.add(name)
          files[name] = new Uint8Array(await blob.arrayBuffer())
        }
        // Images are already compressed; store (level 0) instead of re-deflating.
        const zipped = zipSync(files, { level: 0 })
        downloadBlob(new Blob([zipped], { type: 'application/zip' }), 'halcyon-export.zip')
        onClose()
      } else {
        if (!activeId) return
        const img = getImage(activeId)
        if (!img) return
        const blob = await exportPhoto(img.bitmap, edits[activeId], optsFor(activeId))
        const base = (photos[activeId]?.name || 'halcyon').replace(/\.[^.]+$/, '')
        downloadBlob(blob, `${base}-halcyon.${fmtInfo.ext}`)
        onClose()
      }
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
      setProg(null)
    }
  }

  const seg = (active: boolean) =>
    `flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors ${
      active ? 'border-accent text-accent' : 'border-hairline text-fg-dim hover:bg-hover'
    }`

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        className="w-[320px] rounded-lg border border-hairline bg-raised p-4 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 text-sm font-medium text-fg">Export</div>

        {selection.length > 0 && (
          <div className="mb-3">
            <div className="mb-1 text-[11px] uppercase tracking-wider text-fg-muted">Photos</div>
            <div className="flex gap-1">
              <button onClick={() => setScope('one')} className={seg(scope === 'one')} disabled={!activeId}>
                This photo
              </button>
              <button onClick={() => setScope('selected')} className={seg(scope === 'selected')}>
                Selected ({selection.length})
              </button>
            </div>
          </div>
        )}

        <div className="mb-3">
          <div className="mb-1 text-[11px] uppercase tracking-wider text-fg-muted">Format</div>
          <div className="flex gap-1">
            {FORMATS.map((f) => (
              <button key={f.value} onClick={() => setFmt(f.value)} className={seg(fmt === f.value)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {lossy && (
          <div className="mb-3">
            <div className="mb-1 flex justify-between text-[11px] uppercase tracking-wider text-fg-muted">
              <span>Quality</span>
              <span className="tnum text-fg-dim">{quality}</span>
            </div>
            <input
              type="range"
              min={50}
              max={100}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="hx-range"
              aria-label="Quality"
              style={{
                background: `linear-gradient(90deg, var(--text-secondary) 0%, var(--text-secondary) ${pct}%, var(--border-strong) ${pct}%)`,
              }}
            />
          </div>
        )}

        <div className="mb-4">
          <div className="mb-1 text-[11px] uppercase tracking-wider text-fg-muted">Size</div>
          <div className="flex gap-1">
            {SIZES.map((s, i) => (
              <button key={s.label} onClick={() => setSizeIdx(i)} className={seg(sizeIdx === i)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {err && <div className="mb-2 text-xs text-fg-muted">Export failed: {err}</div>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-hairline px-3 py-1.5 text-xs text-fg-dim hover:bg-hover"
          >
            Cancel
          </button>
          <button
            onClick={doExport}
            disabled={busy || (scope === 'one' ? !activeId : selection.length === 0)}
            className="rounded-md border border-accent px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent-subtle disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy
              ? prog
                ? `Exporting ${prog.done}/${prog.total}…`
                : 'Exporting…'
              : scope === 'selected' && selection.length
                ? `Export ${selection.length} (zip)`
                : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}

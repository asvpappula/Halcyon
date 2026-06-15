import { useState } from 'react'
import { useEditor, getImage } from '../store/editor'
import { exportPhoto, downloadBlob, type ExportFormat } from '../engine/export'

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
  const [fmt, setFmt] = useState<ExportFormat>('image/jpeg')
  const [quality, setQuality] = useState(92)
  const [sizeIdx, setSizeIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (!open) return null
  const fmtInfo = FORMATS.find((f) => f.value === fmt)!
  const lossy = fmt !== 'image/png'
  const pct = (quality - 50) / 0.5

  const doExport = async () => {
    if (!activeId) return
    const img = getImage(activeId)
    if (!img) return
    setBusy(true)
    setErr(null)
    try {
      const blob = await exportPhoto(img.bitmap, edits[activeId], {
        format: fmt,
        quality: quality / 100,
        maxEdge: SIZES[sizeIdx].maxEdge,
      })
      const base = (photos[activeId]?.name || 'halcyon').replace(/\.[^.]+$/, '')
      downloadBlob(blob, `${base}-halcyon.${fmtInfo.ext}`)
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
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
        className="w-[320px] rounded-lg border border-hairline bg-raised p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 text-sm font-medium text-fg">Export</div>

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
            disabled={busy || !activeId}
            className="rounded-md border border-accent px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent-subtle disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}

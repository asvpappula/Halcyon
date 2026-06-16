import { useRef } from 'react'
import { useEditor } from '../store/editor'

async function fileToRef(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  return { id: crypto.randomUUID(), name: file.name, bitmap, url: URL.createObjectURL(file) }
}

/** Match-strength as a gold ring (DESIGN-SYSTEM §5) — confidence, not a grade. */
function StrengthRing({ value }: { value: number }) {
  const r = 22
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - value / 100)
  return (
    <div className="relative h-[52px] w-[52px] shrink-0">
      <svg width="52" height="52" viewBox="0 0 52 52" className="-rotate-90">
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--border-default)" strokeWidth="2" />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 800ms ease' }}
        />
      </svg>
      <span className="tnum absolute inset-0 grid place-items-center text-[11px] text-fg-dim">
        {value}%
      </span>
    </div>
  )
}

export function ReferenceTray() {
  const fileRef = useRef<HTMLInputElement>(null)
  const references = useEditor((s) => s.references)
  const addReference = useEditor((s) => s.addReference)
  const removeReference = useEditor((s) => s.removeReference)
  const applyMatch = useEditor((s) => s.applyMatch)
  const targetStats = useEditor((s) => s.targetStats)
  const matchStrength = useEditor((s) => s.matchStrength)
  const activeId = useEditor((s) => s.activeId)

  const onFiles = async (files: FileList | null) => {
    if (!files) return
    for (const f of Array.from(files)) {
      try {
        const r = await fileToRef(f)
        addReference(r.id, r.name, r.bitmap, r.url)
      } catch (e) {
        console.error(e)
      }
    }
  }

  return (
    <aside
      className="flex w-[200px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-hairline bg-panel p-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        void onFiles(e.dataTransfer.files)
      }}
    >
      <div className="text-[11px] uppercase tracking-wider text-fg-muted">Reference</div>

      {references.length === 0 ? (
        <button
          onClick={() => fileRef.current?.click()}
          className="grid h-28 place-items-center rounded-lg border border-dashed border-hairline-strong px-2 text-center text-xs leading-relaxed text-fg-muted transition-colors hover:border-accent hover:text-fg-dim"
        >
          Drop a reference look,
          <br />
          or click to pick
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {references.map((r) => (
            <div
              key={r.id}
              className="group relative aspect-square overflow-hidden rounded-md border border-hairline"
            >
              <img src={r.url} alt={r.name} className="h-full w-full object-cover" />
              <button
                onClick={() => removeReference(r.id)}
                className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded bg-raised text-fg-muted opacity-0 transition-opacity hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
                aria-label="Remove reference"
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={() => fileRef.current?.click()}
            className="grid aspect-square place-items-center rounded-md border border-dashed border-hairline-strong text-fg-faint transition-colors hover:border-accent hover:text-fg-dim"
            aria-label="Add reference"
          >
            +
          </button>
        </div>
      )}

      {references.length > 1 && (
        <div className="text-[11px] leading-relaxed text-fg-faint">
          Blended target from {references.length} references
        </div>
      )}

      <div className="mt-1 flex items-center gap-3">
        {matchStrength != null && <StrengthRing value={matchStrength} />}
        <button
          disabled={!targetStats || !activeId}
          onClick={applyMatch}
          className="flex-1 rounded-md border border-accent px-3 py-2 text-xs text-accent transition-colors hover:bg-accent-subtle disabled:cursor-not-allowed disabled:opacity-40"
        >
          Apply match
        </button>
      </div>
      {matchStrength != null && matchStrength < 60 && (
        <div className="text-[11px] text-fg-muted">Low confidence — tune to finish.</div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/tiff,image/webp"
        multiple
        className="hidden"
        onChange={(e) => void onFiles(e.target.files)}
      />
    </aside>
  )
}

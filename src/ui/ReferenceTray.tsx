import { useRef, useState } from 'react'
import { useEditor } from '../store/editor'
import { BUILTIN_PRESETS } from '../persist/presets'

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
  const [savingPreset, setSavingPreset] = useState(false)
  const [presetName, setPresetName] = useState('')
  const references = useEditor((s) => s.references)
  const addReference = useEditor((s) => s.addReference)
  const removeReference = useEditor((s) => s.removeReference)
  const applyMatch = useEditor((s) => s.applyMatch)
  const targetStats = useEditor((s) => s.targetStats)
  const matchStrength = useEditor((s) => s.matchStrength)
  const activeId = useEditor((s) => s.activeId)
  const userPresets = useEditor((s) => s.userPresets)
  const applyLook = useEditor((s) => s.applyLook)
  const savePreset = useEditor((s) => s.savePreset)
  const deletePreset = useEditor((s) => s.deletePreset)

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
      aria-label="Reference and presets"
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

      <div className="mt-2 border-t border-hairline pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-fg-muted">Presets</span>
          {!savingPreset && (
            <button
              disabled={!activeId}
              onClick={() => {
                setPresetName('')
                setSavingPreset(true)
              }}
              className="text-[11px] text-fg-dim transition-colors hover:text-fg disabled:opacity-40"
            >
              Save
            </button>
          )}
        </div>
        {savingPreset && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const n = presetName.trim()
              if (n) savePreset(n)
              setSavingPreset(false)
              setPresetName('')
            }}
            className="mb-2 flex gap-1"
          >
            <input
              autoFocus
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSavingPreset(false)
                  setPresetName('')
                }
              }}
              placeholder="Preset name"
              className="min-w-0 flex-1 rounded border border-hairline bg-base px-2 py-1 text-xs text-fg outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="rounded border border-accent px-2 py-1 text-[11px] text-accent transition-colors hover:bg-accent-subtle"
            >
              Save
            </button>
          </form>
        )}
        <div className="flex flex-col gap-1">
          {BUILTIN_PRESETS.map((p) => (
            <button
              key={p.id}
              disabled={!activeId}
              onClick={() => applyLook(p.params)}
              className="rounded-md border border-hairline px-2 py-1.5 text-left text-xs text-fg-dim transition-colors hover:bg-hover hover:text-fg disabled:opacity-40"
            >
              {p.name}
            </button>
          ))}
          {userPresets.map((p) => (
            <div key={p.id} className="group flex items-center gap-1">
              <button
                disabled={!activeId}
                onClick={() => applyLook(p.params)}
                className="flex-1 rounded-md border border-hairline px-2 py-1.5 text-left text-xs text-fg transition-colors hover:bg-hover disabled:opacity-40"
              >
                {p.name}
              </button>
              <button
                onClick={() => deletePreset(p.id)}
                aria-label="Delete preset"
                className="px-1 text-fg-faint opacity-0 transition-opacity hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}
          {userPresets.length === 0 && (
            <span className="text-[11px] leading-relaxed text-fg-faint">
              Save the current look as a preset.
            </span>
          )}
        </div>
      </div>

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

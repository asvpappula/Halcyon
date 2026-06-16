import { useRef, useState } from 'react'
import { useEditor } from '../store/editor'
import { useToasts } from '../store/toast'

/** LUT intensity (0..100) for the active photo. Mirrors the Slider scrub interaction. */
function IntensityRow() {
  const activeId = useEditor((s) => s.activeId)
  const amount = useEditor((s) => (s.activeId ? (s.edits[s.activeId].lut?.amount ?? 0) : 0))
  const setLive = useEditor((s) => s.setLutAmountLive)
  const begin = useEditor((s) => s.beginLutScrub)
  const end = useEditor((s) => s.endLutScrub)
  const [live, setLiveState] = useState(false)
  const fill = live ? 'var(--accent)' : 'var(--text-secondary)'
  const background = `linear-gradient(90deg, ${fill} 0%, ${fill} ${amount}%, var(--border-strong) ${amount}%)`
  return (
    <div className="grid grid-cols-[52px_1fr_32px] items-center gap-2 py-1">
      <span className="text-xs text-fg-muted">Amount</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={amount}
        disabled={!activeId}
        className={`hx-range ${live ? 'live' : ''}`}
        style={{ background }}
        aria-label="LUT amount"
        onChange={(e) => setLive(Number(e.target.value))}
        onPointerDown={() => {
          setLiveState(true)
          begin()
        }}
        onPointerUp={() => {
          setLiveState(false)
          end()
        }}
        onPointerLeave={() => {
          if (live) {
            setLiveState(false)
            end()
          }
        }}
        onBlur={() => end()}
        onKeyDown={() => begin()}
        onKeyUp={() => end()}
      />
      <span className={`tnum text-right text-xs ${live ? 'text-fg' : 'text-fg-dim'}`}>{amount}</span>
    </div>
  )
}

/** Import + apply 3D .cube LUTs. LUTs are shared assets; the active photo references
 *  one with an intensity. docs/FEATURES.md (P5 LUTs). */
export function LutPanel() {
  const fileRef = useRef<HTMLInputElement>(null)
  const activeId = useEditor((s) => s.activeId)
  const luts = useEditor((s) => s.luts)
  const activeLut = useEditor((s) => (s.activeId ? s.edits[s.activeId].lut : null))
  const importLut = useEditor((s) => s.importLut)
  const setLut = useEditor((s) => s.setLut)
  const deleteLut = useEditor((s) => s.deleteLut)
  const pushToast = useToasts((s) => s.push)

  const onFiles = async (files: FileList | null) => {
    if (!files) return
    for (const f of Array.from(files)) {
      try {
        await importLut(f)
      } catch (e) {
        pushToast((e as Error).message || 'Could not read that .cube file.', 'error')
      }
    }
  }

  const itemClass = (active: boolean) =>
    `rounded-md border px-2 py-1.5 text-left text-xs transition-colors disabled:opacity-40 ${
      active ? 'border-accent text-accent' : 'border-hairline text-fg-dim hover:bg-hover hover:text-fg'
    }`

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-fg-muted">LUT</span>
        <button
          onClick={() => fileRef.current?.click()}
          className="text-[11px] text-fg-dim transition-colors hover:text-fg"
        >
          Import .cube
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <button disabled={!activeId} onClick={() => setLut(null)} className={itemClass(!activeLut)}>
          None
        </button>
        {luts.map((l) => (
          <div key={l.id} className="group flex items-center gap-1">
            <button
              disabled={!activeId}
              onClick={() => setLut(l.id)}
              className={`flex-1 ${itemClass(activeLut?.id === l.id)}`}
            >
              {l.name}
            </button>
            <button
              onClick={() => deleteLut(l.id)}
              aria-label="Delete LUT"
              className="px-1 text-fg-faint opacity-0 transition-opacity hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
        {luts.length === 0 && (
          <span className="text-[11px] leading-relaxed text-fg-faint">
            Import a .cube LUT to apply a film or creative look.
          </span>
        )}
      </div>
      {activeLut && (
        <div className="mt-2">
          <IntensityRow />
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".cube"
        multiple
        className="hidden"
        onChange={(e) => void onFiles(e.target.files)}
      />
    </div>
  )
}

import { useState } from 'react'
import { useEditor, type ControlKey } from '../store/editor'
import { DEFAULT_PARAMS } from '../engine/types'

interface SliderProps {
  label: string
  ck: ControlKey
  min?: number
  max?: number
}

/** A develop control row: thin track, gold fill while live, tabular readout,
 *  double-click to reset. Wired to the store's coalesced-command history. */
export function Slider({ label, ck, min = -100, max = 100 }: SliderProps) {
  const activeId = useEditor((s) => s.activeId)
  const value = useEditor((s) => (s.activeId ? s.edits[s.activeId][ck] : DEFAULT_PARAMS[ck]))
  const setLive = useEditor((s) => s.setControlLive)
  const begin = useEditor((s) => s.beginScrub)
  const end = useEditor((s) => s.endScrub)
  const reset = useEditor((s) => s.resetControl)
  const [live, setLiveState] = useState(false)

  const pct = ((value - min) / (max - min)) * 100
  const fillColor = live ? 'var(--accent)' : 'var(--text-secondary)'
  const background = `linear-gradient(90deg, ${fillColor} 0%, ${fillColor} ${pct}%, var(--border-strong) ${pct}%)`
  const shown = value > 0 ? `+${value}` : `${value}`

  return (
    <div className="grid grid-cols-[64px_1fr_36px] items-center gap-2 py-1.5">
      <span className="text-xs text-fg-muted">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={!activeId}
        className={`hx-range ${live ? 'live' : ''}`}
        style={{ background }}
        aria-label={label}
        onChange={(e) => setLive(ck, Number(e.target.value))}
        onPointerDown={() => {
          setLiveState(true)
          begin(ck)
        }}
        onPointerUp={() => {
          setLiveState(false)
          end(ck)
        }}
        onPointerLeave={() => {
          if (live) {
            setLiveState(false)
            end(ck)
          }
        }}
        onBlur={() => end(ck)}
        onKeyDown={() => begin(ck)}
        onKeyUp={() => end(ck)}
        onDoubleClick={() => reset(ck)}
      />
      <span className={`tnum text-right text-xs ${live ? 'text-fg' : 'text-fg-dim'}`}>{shown}</span>
    </div>
  )
}

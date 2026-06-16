import { useState } from 'react'
import { useEditor, type HslChannel } from '../store/editor'
import { HSL_BANDS } from '../engine/types'

// Representative swatch hue (deg) per band — matches HSL_BANDS / the shader band centers.
const BAND_HUES = [0, 30, 60, 120, 180, 240, 270, 300]
const HSL_KEY = { hue: 'hslHue', sat: 'hslSat', lum: 'hslLum' } as const

/** One channel row for the active band. Mirrors Slider's coalesced-scrub interaction,
 *  but targets an HSL band array via the store's setHslLive/beginHslScrub/endHslScrub. */
function HslRow({ band, channel, label }: { band: number; channel: HslChannel; label: string }) {
  const activeId = useEditor((s) => s.activeId)
  const key = HSL_KEY[channel]
  const value = useEditor((s) => (s.activeId ? (s.edits[s.activeId][key]?.[band] ?? 0) : 0))
  const setLive = useEditor((s) => s.setHslLive)
  const begin = useEditor((s) => s.beginHslScrub)
  const end = useEditor((s) => s.endHslScrub)
  const [live, setLiveState] = useState(false)

  const pct = ((value + 100) / 200) * 100
  const fillColor = live ? 'var(--accent)' : 'var(--text-secondary)'
  const background = `linear-gradient(90deg, ${fillColor} 0%, ${fillColor} ${pct}%, var(--border-strong) ${pct}%)`
  const shown = value > 0 ? `+${value}` : `${value}`

  return (
    <div className="grid grid-cols-[44px_1fr_32px] items-center gap-2 py-1">
      <span className="text-xs text-fg-muted">{label}</span>
      <input
        type="range"
        min={-100}
        max={100}
        step={1}
        value={value}
        disabled={!activeId}
        className={`hx-range ${live ? 'live' : ''}`}
        style={{ background }}
        aria-label={`${label} ${HSL_BANDS[band]}`}
        onChange={(e) => setLive(band, channel, Number(e.target.value))}
        onPointerDown={() => {
          setLiveState(true)
          begin(band, channel)
        }}
        onPointerUp={() => {
          setLiveState(false)
          end(band, channel)
        }}
        onPointerLeave={() => {
          if (live) {
            setLiveState(false)
            end(band, channel)
          }
        }}
        onBlur={() => end(band, channel)}
        onKeyDown={() => begin(band, channel)}
        onKeyUp={() => end(band, channel)}
        onDoubleClick={() => {
          begin(band, channel)
          setLive(band, channel, 0)
          end(band, channel)
        }}
      />
      <span className={`tnum text-right text-xs ${live ? 'text-fg' : 'text-fg-dim'}`}>{shown}</span>
    </div>
  )
}

/** HSL / Color Mixer: pick a color band, then tune its hue/saturation/luminance.
 *  A gold dot marks bands that carry edits. docs/FEATURES.md (P4 HSL). */
export function HslMixer() {
  const [band, setBand] = useState(0)
  const activeId = useEditor((s) => s.activeId)
  const resetHsl = useEditor((s) => s.resetHsl)
  // Bitmask of bands that have any non-zero value across the three channels.
  const touched = useEditor((s) => {
    if (!s.activeId) return 0
    const e = s.edits[s.activeId]
    let mask = 0
    for (let i = 0; i < 8; i++) {
      const on =
        (e.hslHue?.[i] ?? 0) !== 0 || (e.hslSat?.[i] ?? 0) !== 0 || (e.hslLum?.[i] ?? 0) !== 0
      if (on) mask |= 1 << i
    }
    return mask
  })

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-fg-muted">Color Mixer</span>
        <button
          onClick={resetHsl}
          disabled={!activeId || touched === 0}
          className="text-[11px] text-fg-dim transition-colors hover:text-fg disabled:opacity-40"
        >
          Reset
        </button>
      </div>
      <div className="mb-3 flex gap-1">
        {BAND_HUES.map((deg, i) => (
          <button
            key={i}
            onClick={() => setBand(i)}
            disabled={!activeId}
            title={HSL_BANDS[i]}
            aria-label={HSL_BANDS[i]}
            aria-pressed={band === i}
            className="relative h-6 flex-1 rounded transition-transform hover:scale-105 disabled:opacity-40"
            style={{
              background: `hsl(${deg} 70% 55%)`,
              outline: band === i ? '2px solid var(--accent)' : 'none',
              outlineOffset: '1px',
            }}
          >
            {(touched >> i) & 1 ? (
              <span className="absolute -right-0.5 -top-1 h-1.5 w-1.5 rounded-full bg-accent" />
            ) : null}
          </button>
        ))}
      </div>
      <div className="mb-1 text-xs text-fg-dim">{HSL_BANDS[band]}</div>
      <HslRow band={band} channel="hue" label="Hue" />
      <HslRow band={band} channel="sat" label="Sat" />
      <HslRow band={band} channel="lum" label="Lum" />
    </div>
  )
}

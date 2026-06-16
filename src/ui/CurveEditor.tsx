import { useRef, useState } from 'react'
import { useEditor, type CurveChannel } from '../store/editor'
import { evalCurve, IDENTITY_CURVES } from '../engine/curve'

const SZ = 240
const P = 10
const PLOT = SZ - 2 * P
const CHANNELS: { key: CurveChannel; label: string; color: string }[] = [
  { key: 'rgb', label: 'RGB', color: 'var(--text-secondary)' },
  { key: 'r', label: 'R', color: '#e5564e' },
  { key: 'g', label: 'G', color: '#4eb86a' },
  { key: 'b', label: 'B', color: '#4e86e5' },
]
const toSvgX = (x: number): number => P + x * PLOT
const toSvgY = (y: number): number => P + (1 - y) * PLOT
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Interactive tone curve: master (RGB) + per-channel point editing. Drag points,
 *  click empty space to add, double-click to remove. docs/FEATURES.md (P4 curve). */
export function CurveEditor() {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<number | null>(null)
  const [channel, setChannel] = useState<CurveChannel>('rgb')
  const activeId = useEditor((s) => s.activeId)
  const curves = useEditor((s) => (s.activeId ? s.edits[s.activeId].curves : null)) ?? IDENTITY_CURVES()
  const setCurve = useEditor((s) => s.setCurve)
  const begin = useEditor((s) => s.beginCurveScrub)
  const end = useEditor((s) => s.endCurveScrub)
  const addPoint = useEditor((s) => s.addCurvePoint)
  const removePoint = useEditor((s) => s.removeCurvePoint)
  const resetCurves = useEditor((s) => s.resetCurves)

  const pts = curves[channel]
  const meta = CHANNELS.find((c) => c.key === channel)!

  const toData = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * SZ
    const py = ((e.clientY - r.top) / r.height) * SZ
    return { x: clamp01((px - P) / PLOT), y: clamp01(1 - (py - P) / PLOT) }
  }

  const onPointDown = (i: number) => (e: React.PointerEvent) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    dragRef.current = i
    begin()
  }
  const onMove = (e: React.PointerEvent) => {
    const i = dragRef.current
    if (i == null) return
    const { x, y } = toData(e)
    const next = pts.map((p) => ({ ...p }))
    if (i === 0) next[0] = { x: 0, y }
    else if (i === pts.length - 1) next[i] = { x: 1, y }
    else {
      const lo = next[i - 1].x + 0.001
      const hi = next[i + 1].x - 0.001
      next[i] = { x: Math.max(lo, Math.min(hi, x)), y }
    }
    setCurve(channel, next)
  }
  const onUp = () => {
    if (dragRef.current == null) return
    dragRef.current = null
    end()
  }
  const onPlotClick = (e: React.MouseEvent) => {
    if ((e.target as Element).tagName === 'circle') return // a point, not empty space
    const { x } = toData(e)
    if (x <= 0.02 || x >= 0.98) return // don't stack onto the endpoints
    const { y } = toData(e)
    addPoint(channel, x, y)
  }

  const N = 48
  let d = ''
  for (let i = 0; i <= N; i++) {
    const x = i / N
    d += (i === 0 ? 'M' : 'L') + toSvgX(x).toFixed(1) + ' ' + toSvgY(evalCurve(pts, x)).toFixed(1) + ' '
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-fg-muted">Tone Curve</span>
        <button
          onClick={resetCurves}
          disabled={!activeId}
          className="text-[11px] text-fg-dim transition-colors hover:text-fg disabled:opacity-40"
        >
          Reset
        </button>
      </div>
      <div className="mb-2 flex gap-1">
        {CHANNELS.map((c) => (
          <button
            key={c.key}
            onClick={() => setChannel(c.key)}
            disabled={!activeId}
            className={`flex-1 rounded border px-2 py-1 text-[11px] transition-colors disabled:opacity-40 ${
              channel === c.key ? 'border-accent text-fg' : 'border-hairline text-fg-muted hover:bg-hover'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SZ} ${SZ}`}
        className="w-full touch-none rounded-md border border-hairline bg-raised"
        style={{ pointerEvents: activeId ? 'auto' : 'none' }}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onClick={onPlotClick}
      >
        {[0.25, 0.5, 0.75].map((g) => (
          <g key={g}>
            <line x1={toSvgX(g)} y1={P} x2={toSvgX(g)} y2={SZ - P} stroke="var(--border-default)" strokeWidth="0.5" />
            <line x1={P} y1={toSvgY(g)} x2={SZ - P} y2={toSvgY(g)} stroke="var(--border-default)" strokeWidth="0.5" />
          </g>
        ))}
        <line
          x1={toSvgX(0)}
          y1={toSvgY(0)}
          x2={toSvgX(1)}
          y2={toSvgY(1)}
          stroke="var(--border-strong)"
          strokeWidth="0.5"
          strokeDasharray="3 3"
        />
        <path d={d} fill="none" stroke={meta.color} strokeWidth="1.5" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={toSvgX(p.x)}
            cy={toSvgY(p.y)}
            r="5"
            fill={meta.color}
            stroke="var(--bg-canvas)"
            strokeWidth="1.5"
            className="cursor-pointer"
            onPointerDown={onPointDown(i)}
            onDoubleClick={(e) => {
              e.stopPropagation()
              removePoint(channel, i)
            }}
          />
        ))}
      </svg>
      <p className="mt-2 text-[11px] leading-relaxed text-fg-faint">
        Click to add a point · drag to shape · double-click a point to remove.
      </p>
    </div>
  )
}

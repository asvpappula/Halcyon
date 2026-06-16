import { useRef } from 'react'
import { useEditor } from '../store/editor'
import { DEFAULT_COLOR_GRADE, type ColorGrade } from '../engine/types'

const WHEEL_R = 34 // px from center to full saturation

/** A hue/saturation color wheel: drag to pick hue (angle) + saturation (radius). */
function ColorWheel({
  hue,
  sat,
  disabled,
  onBegin,
  onChange,
  onEnd,
}: {
  hue: number
  sat: number
  disabled?: boolean
  onBegin: () => void
  onChange: (hue: number, sat: number) => void
  onEnd: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = (clientX: number, clientY: number) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const dx = clientX - (r.left + r.width / 2)
    const dy = clientY - (r.top + r.height / 2)
    let h = (Math.atan2(dy, dx) * 180) / Math.PI
    if (h < 0) h += 360
    const s = Math.min(100, Math.round((Math.hypot(dx, dy) / WHEEL_R) * 100))
    onChange(Math.round(h), s)
  }
  const ang = (hue * Math.PI) / 180
  const rad = (sat / 100) * WHEEL_R
  return (
    <div
      ref={ref}
      role="slider"
      aria-label="Color wheel"
      aria-valuenow={Math.round(hue)}
      className={`relative h-[72px] w-[72px] rounded-full border border-hairline ${disabled ? 'opacity-40' : 'cursor-crosshair'}`}
      style={{
        background:
          'conic-gradient(from 90deg, hsl(0 90% 55%), hsl(60 90% 55%), hsl(120 90% 55%), hsl(180 90% 55%), hsl(240 90% 55%), hsl(300 90% 55%), hsl(360 90% 55%))',
      }}
      onPointerDown={(e) => {
        if (disabled) return
        e.currentTarget.setPointerCapture(e.pointerId)
        onBegin()
        drag(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => {
        if (!disabled && e.buttons === 1) drag(e.clientX, e.clientY)
      }}
      onPointerUp={onEnd}
      onDoubleClick={() => {
        if (disabled) return
        onBegin()
        onChange(0, 0)
        onEnd()
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ background: 'radial-gradient(circle, var(--bg-panel) 0%, transparent 72%)' }}
      />
      <div
        className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
        style={{ left: `calc(50% + ${Math.cos(ang) * rad}px)`, top: `calc(50% + ${Math.sin(ang) * rad}px)` }}
      />
    </div>
  )
}

function ThinRange({
  value,
  min,
  max,
  disabled,
  onBegin,
  onInput,
  onEnd,
}: {
  value: number
  min: number
  max: number
  disabled?: boolean
  onBegin: () => void
  onInput: (v: number) => void
  onEnd: () => void
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={1}
      value={value}
      disabled={disabled}
      className="hx-range"
      style={{
        background: `linear-gradient(90deg, var(--text-secondary) 0%, var(--text-secondary) ${pct}%, var(--border-strong) ${pct}%)`,
      }}
      onPointerDown={onBegin}
      onChange={(e) => onInput(Number(e.target.value))}
      onPointerUp={onEnd}
      onBlur={onEnd}
      onKeyDown={onBegin}
      onKeyUp={onEnd}
    />
  )
}

const REGIONS: { key: 'sh' | 'mid' | 'hi'; label: string }[] = [
  { key: 'sh', label: 'Shadows' },
  { key: 'mid', label: 'Midtones' },
  { key: 'hi', label: 'Highlights' },
]

/** 3-way color grading: hue/sat wheel + luminance per region, plus balance. */
export function ColorGradePanel() {
  const activeId = useEditor((s) => s.activeId)
  const cg = useEditor((s) =>
    s.activeId ? (s.edits[s.activeId].colorGrade ?? DEFAULT_COLOR_GRADE()) : DEFAULT_COLOR_GRADE(),
  )
  const setLive = useEditor((s) => s.setColorGradeLive)
  const begin = useEditor((s) => s.beginColorGradeScrub)
  const end = useEditor((s) => s.endColorGradeScrub)
  const disabled = !activeId

  // Always merge against the freshest store value so fast drags don't drop updates.
  const patch = (p: Partial<ColorGrade>) => {
    const cur =
      useEditor.getState().activeId &&
      useEditor.getState().edits[useEditor.getState().activeId as string].colorGrade
    setLive({ ...(cur || DEFAULT_COLOR_GRADE()), ...p })
  }

  return (
    <div>
      <div className="mb-2 text-[11px] uppercase tracking-wider text-fg-muted">Color Grading</div>
      <div className="flex justify-between gap-2">
        {REGIONS.map(({ key, label }) => {
          const [h, s, l] = cg[key]
          return (
            <div key={key} className="flex flex-1 flex-col items-center gap-1.5">
              <ColorWheel
                hue={h}
                sat={s}
                disabled={disabled}
                onBegin={begin}
                onChange={(nh, ns) => patch({ [key]: [nh, ns, l] })}
                onEnd={end}
              />
              <span className="text-[10px] text-fg-muted">{label}</span>
              <ThinRange
                value={l}
                min={-100}
                max={100}
                disabled={disabled}
                onBegin={begin}
                onInput={(v) => patch({ [key]: [h, s, v] })}
                onEnd={end}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-3 grid grid-cols-[60px_1fr] items-center gap-2">
        <span className="text-xs text-fg-muted">Balance</span>
        <ThinRange
          value={cg.balance}
          min={-100}
          max={100}
          disabled={disabled}
          onBegin={begin}
          onInput={(v) => patch({ balance: v })}
          onEnd={end}
        />
      </div>
    </div>
  )
}

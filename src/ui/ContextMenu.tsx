import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface MenuItem {
  label?: string
  onClick?: () => void
  disabled?: boolean
  separator?: boolean
  checked?: boolean
  shortcut?: string
  submenu?: MenuItem[]
}

function MenuList({ items, onClose, flip }: { items: MenuItem[]; onClose: () => void; flip: boolean }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <ul className="min-w-[208px] rounded-lg border border-hairline bg-raised p-1 shadow-[0_24px_70px_-18px_rgba(0,0,0,0.85)]">
      {items.map((it, i) => {
        if (it.separator) return <li key={i} className="my-1 h-px bg-hairline" aria-hidden />
        const hasSub = !!it.submenu?.length
        return (
          <li key={i} className="relative" onMouseEnter={() => setOpen(hasSub ? i : null)}>
            <button
              type="button"
              disabled={it.disabled}
              onClick={() => {
                if (hasSub) {
                  setOpen(open === i ? null : i)
                  return
                }
                it.onClick?.()
                onClose()
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-fg-dim transition-colors hover:bg-hover hover:text-fg disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-fg-dim"
            >
              <span className="w-3 shrink-0 text-accent">{it.checked ? '✓' : ''}</span>
              <span className="flex-1 truncate">{it.label}</span>
              {it.shortcut && <span className="tnum shrink-0 text-fg-faint">{it.shortcut}</span>}
              {hasSub && <span className="shrink-0 text-fg-faint">›</span>}
            </button>
            {hasSub && open === i && (
              <div className={`absolute top-0 ${flip ? 'right-full pr-1' : 'left-full pl-1'}`}>
                <MenuList items={it.submenu ?? []} onClose={onClose} flip={flip} />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** A right-click menu rendered at the cursor, clamped to the viewport. Dismisses on
 *  Escape, outside pointerdown, scroll, resize, or blur. Submenus open on hover. */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const nx = Math.max(8, Math.min(x, window.innerWidth - r.width - 8))
    const ny = Math.max(8, Math.min(y, window.innerHeight - r.height - 8))
    setPos({ x: nx, y: ny })
  }, [x, y])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  const flip = pos.x > window.innerWidth * 0.6
  return (
    <div
      className="fixed inset-0 z-[100]"
      onPointerDown={onClose}
      onContextMenu={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div
        ref={ref}
        style={{ left: pos.x, top: pos.y }}
        className="absolute"
        onPointerDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <MenuList items={items} onClose={onClose} flip={flip} />
      </div>
    </div>
  )
}

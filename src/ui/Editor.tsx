import { useEffect, useRef } from 'react'
import { CanvasView } from './CanvasView'
import { Slider } from './Slider'
import { ReferenceTray } from './ReferenceTray'
import { useEditor } from '../store/editor'
import { loadImageFile } from './import'

function TopButton({
  children,
  onClick,
  disabled,
  primary,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  title?: string
}) {
  const base =
    'rounded-md px-3 py-1.5 text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
  const style = primary
    ? 'border border-accent text-accent hover:bg-accent-subtle'
    : 'border border-hairline text-fg-dim hover:bg-raised'
  return (
    <button className={`${base} ${style}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  )
}

export function Editor() {
  const fileRef = useRef<HTMLInputElement>(null)
  const addPhoto = useEditor((s) => s.addPhoto)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const resetView = useEditor((s) => s.resetView)
  const activeId = useEditor((s) => s.activeId)
  const order = useEditor((s) => s.order)
  const photos = useEditor((s) => s.photos)
  const setActive = useEditor((s) => s.setActive)
  const hist = useEditor((s) => (s.activeId ? s.history[s.activeId] : undefined))
  const canUndo = !!hist && hist.cursor > 0
  const canRedo = !!hist && hist.cursor < hist.stack.length

  const onFiles = async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      try {
        const { meta, bitmap, bytes } = await loadImageFile(file)
        addPhoto(meta, bitmap, bytes)
      } catch (e) {
        // Inline, non-blocking: surface to console; a designed error toast lands in Phase 2.
        console.error(e)
        alert((e as Error).message)
      }
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      } else if (e.key === '0') {
        resetView()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, resetView])

  return (
    <div className="flex h-full flex-col">
      {/* top bar */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-hairline bg-panel px-4">
        <span className="h-2.5 w-2.5 rounded-sm bg-accent" aria-hidden />
        <span className="text-[13px] font-medium tracking-tight">Halcyon</span>
        <span className="ml-1 rounded-md bg-raised px-2 py-1 text-xs text-fg">Develop</span>
        <div className="flex-1" />
        <TopButton onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">
          Undo
        </TopButton>
        <TopButton onClick={redo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)">
          Redo
        </TopButton>
        <TopButton onClick={resetView} title="Reset view (0)">
          Reset view
        </TopButton>
        <TopButton primary onClick={() => fileRef.current?.click()} title="Import photos">
          Import
        </TopButton>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/tiff,image/webp"
          multiple
          className="hidden"
          onChange={(e) => void onFiles(e.target.files)}
        />
      </header>

      {/* body */}
      <div className="flex min-h-0 flex-1">
        <ReferenceTray />
        <main className="min-w-0 flex-1">
          <CanvasView />
        </main>
        <aside className="w-[264px] shrink-0 overflow-y-auto border-l border-hairline bg-panel px-4 py-3">
          <div className="mb-1 text-[11px] uppercase tracking-wider text-fg-muted">Light</div>
          <Slider label="Exposure" ck="exposure" />
          <Slider label="Contrast" ck="contrast" />
          <Slider label="Highlights" ck="highlights" />
          <Slider label="Shadows" ck="shadows" />
          <Slider label="Whites" ck="whites" />
          <Slider label="Blacks" ck="blacks" />
          <div className="mb-1 mt-5 text-[11px] uppercase tracking-wider text-fg-muted">Color</div>
          <Slider label="Temp" ck="temp" />
          <Slider label="Tint" ck="tint" />
          <Slider label="Vibrance" ck="vibrance" />
          <Slider label="Saturation" ck="saturation" />
          <p className="mt-5 text-[11px] leading-relaxed text-fg-faint">
            Drop a reference look on the left, then Apply match. Double-click any slider to reset.
          </p>
        </aside>
      </div>

      {/* filmstrip (only when multiple imported) */}
      {order.length > 1 && (
        <footer className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-t border-hairline bg-panel px-3">
          {order.map((id) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={`shrink-0 rounded-md border px-3 py-1.5 text-xs ${
                id === activeId
                  ? 'border-accent text-fg'
                  : 'border-hairline text-fg-muted hover:bg-raised'
              }`}
              title={photos[id]?.name}
            >
              {photos[id]?.name.slice(0, 18) ?? id.slice(0, 6)}
            </button>
          ))}
        </footer>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { CanvasView } from './CanvasView'
import { Slider } from './Slider'
import { HslMixer } from './HslMixer'
import { ColorGradePanel } from './ColorGrade'
import { CurveEditor } from './CurveEditor'
import { LutPanel } from './LutPanel'
import { Filmstrip } from './Filmstrip'
import { ReferenceTray } from './ReferenceTray'
import { ExportDialog } from './ExportDialog'
import { FunnelHero } from './FunnelHero'
import { useEditor } from '../store/editor'
import { useToasts } from '../store/toast'
import { loadImageFile } from './import'
import { centeredCrop } from '../engine/crop'
import { buildLookUrl } from '../engine/look'

const CROP_PRESETS: [string, number, number][] = [
  ['1:1', 1, 1],
  ['4:5', 4, 5],
  ['16:9', 16, 9],
  ['3:2', 3, 2],
]
const cropBtnClass = (active: boolean) =>
  `rounded-md border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
    active ? 'border-accent text-accent' : 'border-hairline text-fg-dim hover:bg-hover'
  }`

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
  const [exportOpen, setExportOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [importing, setImporting] = useState(0)
  const addPhoto = useEditor((s) => s.addPhoto)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const resetView = useEditor((s) => s.resetView)
  const activeId = useEditor((s) => s.activeId)
  const order = useEditor((s) => s.order)
  const photos = useEditor((s) => s.photos)
  const hist = useEditor((s) => (s.activeId ? s.history[s.activeId] : undefined))
  const canUndo = !!hist && hist.cursor > 0
  const canRedo = !!hist && hist.cursor < hist.stack.length
  const setCrop = useEditor((s) => s.setCrop)
  const activeCrop = useEditor((s) => (s.activeId ? s.edits[s.activeId].crop : null))
  const pendingLook = useEditor((s) => s.pendingLook)
  const applyLook = useEditor((s) => s.applyLook)
  const setPendingLook = useEditor((s) => s.setPendingLook)
  const pushToast = useToasts((s) => s.push)
  const copySettings = useEditor((s) => s.copySettings)
  const pasteSettings = useEditor((s) => s.pasteSettings)
  const clipboard = useEditor((s) => s.clipboard)
  const setCompare = useEditor((s) => s.setCompare)
  const eyedropper = useEditor((s) => s.eyedropper)
  const setEyedropper = useEditor((s) => s.setEyedropper)

  const doCopy = () => {
    copySettings()
    pushToast('Settings copied')
  }

  const shareLook = async () => {
    if (!activeId) return
    const url = buildLookUrl(useEditor.getState().edits[activeId])
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      /* clipboard blocked; the URL is still in-app */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const onFiles = async (files: FileList | null) => {
    if (!files) return
    const arr = Array.from(files)
    setImporting((n) => n + arr.length)
    let ok = 0
    for (const file of arr) {
      try {
        const { meta, bitmap, bytes } = await loadImageFile(file)
        addPhoto(meta, bitmap, bytes)
        ok++
      } catch (e) {
        console.error(e)
        pushToast((e as Error).message || 'Could not import that file.', 'error')
      }
      setImporting((n) => n - 1)
    }
    if (ok > 0) pushToast(`Imported ${ok} ${ok === 1 ? 'photo' : 'photos'}`)
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

  // Hold "\" to compare against the original (press-and-hold, like Lightroom).
  useEffect(() => {
    const setC = useEditor.getState().setCompare
    const down = (e: KeyboardEvent) => {
      if (e.key === '\\') {
        e.preventDefault()
        setC(true)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === '\\') setC(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Open the export dialog when the context menu requests it.
  useEffect(() => {
    const onExport = () => setExportOpen(true)
    window.addEventListener('halcyon:export', onExport)
    return () => window.removeEventListener('halcyon:export', onExport)
  }, [])

  // Library shortcuts: 1–5 rate the active photo (press the same number to clear),
  // P/X flag pick/reject (toggle), U unflag. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const st = useEditor.getState()
      const id = st.activeId
      if (!id) return
      if (e.key >= '1' && e.key <= '5') {
        const n = Number(e.key)
        st.setRating(id, st.ratings[id] === n ? 0 : n)
      } else if (e.key === 'p' || e.key === 'P') {
        st.setFlag(id, st.flags[id] === 'pick' ? null : 'pick')
      } else if (e.key === 'x' || e.key === 'X') {
        st.setFlag(id, st.flags[id] === 'reject' ? null : 'reject')
      } else if (e.key === 'u' || e.key === 'U') {
        st.setFlag(id, null)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const idx = st.order.indexOf(id)
        const ni = e.key === 'ArrowLeft' ? idx - 1 : idx + 1
        if (idx >= 0 && ni >= 0 && ni < st.order.length) {
          e.preventDefault()
          st.setActive(st.order[ni])
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
        <TopButton onClick={doCopy} disabled={!activeId} title="Copy this photo's develop settings">
          Copy
        </TopButton>
        <TopButton
          onClick={pasteSettings}
          disabled={!activeId || !clipboard}
          title={clipboard ? 'Paste settings onto this photo' : 'Copy settings from a photo first'}
        >
          Paste
        </TopButton>
        <button
          onClick={() => setEyedropper(!eyedropper)}
          disabled={!activeId}
          aria-pressed={eyedropper}
          title="White balance eyedropper — click a neutral gray in the photo"
          className={`rounded-md border px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            eyedropper ? 'border-accent text-accent' : 'border-hairline text-fg-dim hover:bg-raised'
          }`}
        >
          WB
        </button>
        <button
          onPointerDown={() => setCompare(true)}
          onPointerUp={() => setCompare(false)}
          onPointerLeave={() => setCompare(false)}
          disabled={!activeId}
          aria-label="Compare with original (hold)"
          title="Hold to see the original (or hold \ )"
          className="rounded-md border border-hairline px-3 py-1.5 text-xs text-fg-dim transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
        >
          Before
        </button>
        <TopButton onClick={resetView} title="Reset view (0)">
          Reset view
        </TopButton>
        <TopButton onClick={() => fileRef.current?.click()} title="Import photos">
          Import
        </TopButton>
        {importing > 0 && (
          <span className="tnum animate-pulse text-xs text-accent" role="status">
            Importing {importing}…
          </span>
        )}
        <TopButton primary disabled={!activeId} onClick={() => setExportOpen(true)} title="Export">
          Export
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

      {pendingLook && (
        <div className="flex items-center justify-center gap-3 border-b border-hairline bg-accent-subtle px-4 py-2 text-xs text-fg">
          <span>A shared look is ready{!activeId ? ' — import a photo to apply it' : ''}.</span>
          <button
            disabled={!activeId}
            onClick={() => applyLook(pendingLook)}
            className="rounded-md border border-accent px-2 py-1 text-accent transition-colors hover:bg-accent-subtle disabled:opacity-40"
          >
            Apply
          </button>
          <button onClick={() => setPendingLook(null)} className="text-fg-muted hover:text-fg">
            Dismiss
          </button>
        </div>
      )}

      {/* body — funnel landing until the first photo is imported */}
      {order.length === 0 ? (
        <div className="min-h-0 flex-1">
          <FunnelHero />
        </div>
      ) : (
      <div className="flex min-h-0 flex-1">
        <ReferenceTray />
        <main className="min-w-0 flex-1">
          <CanvasView />
        </main>
        <aside
          aria-label="Develop controls"
          className="w-[264px] shrink-0 overflow-y-auto border-l border-hairline bg-panel px-4 py-3"
        >
          <div className="mb-1 text-[11px] uppercase tracking-wider text-fg-muted">Light</div>
          <Slider label="Exposure" ck="exposure" />
          <Slider label="Contrast" ck="contrast" />
          <Slider label="Highlights" ck="highlights" />
          <Slider label="Shadows" ck="shadows" />
          <Slider label="Whites" ck="whites" />
          <Slider label="Blacks" ck="blacks" />
          <div className="mb-1 mt-5 text-[11px] uppercase tracking-wider text-fg-muted">Presence</div>
          <Slider label="Texture" ck="texture" />
          <Slider label="Clarity" ck="clarity" />
          <Slider label="Dehaze" ck="dehaze" />
          <div className="mb-1 mt-5 text-[11px] uppercase tracking-wider text-fg-muted">Color</div>
          <Slider label="Temp" ck="temp" />
          <Slider label="Tint" ck="tint" />
          <Slider label="Vibrance" ck="vibrance" />
          <Slider label="Saturation" ck="saturation" />

          <div className="mt-5">
            <HslMixer />
          </div>

          <div className="mt-5">
            <ColorGradePanel />
          </div>

          <div className="mb-1 mt-5 text-[11px] uppercase tracking-wider text-fg-muted">Detail</div>
          <Slider label="Sharpen" ck="sharpen" min={0} />
          <Slider label="Radius" ck="sharpenRadius" min={0} />
          <Slider label="Detail" ck="sharpenDetail" min={0} />
          <Slider label="Masking" ck="sharpenMasking" min={0} />
          <Slider label="Noise" ck="noiseReduction" min={0} />
          <Slider label="Color NR" ck="colorNoiseReduction" min={0} />
          <div className="mb-1 mt-5 text-[11px] uppercase tracking-wider text-fg-muted">Effects</div>
          <Slider label="Vignette" ck="vignette" />
          <Slider label="Midpoint" ck="vignetteMidpoint" min={0} />
          <Slider label="Feather" ck="vignetteFeather" min={0} />
          <Slider label="Roundness" ck="vignetteRoundness" />
          <Slider label="Grain" ck="grain" min={0} />
          <Slider label="Size" ck="grainSize" min={0} />
          <Slider label="Roughness" ck="grainRoughness" min={0} />

          <div className="mt-5">
            <CurveEditor />
          </div>

          <div className="mt-5">
            <LutPanel />
          </div>

          <div className="mb-1 mt-5 text-[11px] uppercase tracking-wider text-fg-muted">Geometry</div>
          <Slider label="Straighten" ck="straighten" min={-45} max={45} />
          <Slider label="Persp H" ck="perspectiveH" />
          <Slider label="Persp V" ck="perspectiveV" />

          <div className="mb-1 mt-5 text-[11px] uppercase tracking-wider text-fg-muted">Crop</div>
          <div className="flex flex-wrap gap-1">
            <button
              disabled={!activeId}
              onClick={() => setCrop(null)}
              className={cropBtnClass(!activeCrop)}
            >
              Original
            </button>
            {CROP_PRESETS.map(([label, aw, ah]) => (
              <button
                key={label}
                disabled={!activeId}
                onClick={() => {
                  const p = activeId ? photos[activeId] : null
                  if (p) setCrop(centeredCrop(p.width, p.height, aw, ah))
                }}
                className={cropBtnClass(false)}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={shareLook}
            disabled={!activeId}
            className="mt-5 w-full rounded-md border border-hairline px-3 py-1.5 text-xs text-fg-dim transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {copied ? 'Link copied' : 'Share this look'}
          </button>
          <p className="mt-3 text-[11px] leading-relaxed text-fg-faint">
            Drop a reference look on the left, then Apply match. Double-click any slider to reset.
          </p>
        </aside>
      </div>
      )}

      {/* library bar + filmstrip + batch controls (when multiple imported) */}
      {order.length > 1 && <Filmstrip />}

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  )
}

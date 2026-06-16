import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { DevelopRenderer } from '../engine/pipeline'
import { useEditor, getImage, getLutData } from '../store/editor'
import { DEFAULT_PARAMS } from '../engine/types'

/** Hosts the WebGL2 canvas. Renders on demand when the active image, params, or
 *  view change. Wheel = zoom, drag = pan (when zoomed), double-click = reset view. */
export function CanvasView() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<DevelopRenderer | null>(null)
  const rafRef = useRef<number | null>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activeId = useEditor((s) => s.activeId)
  const params = useEditor((s) => (s.activeId ? s.edits[s.activeId] : DEFAULT_PARAMS))
  const compare = useEditor((s) => s.compare)
  const view = useEditor((s) => s.view)
  const crop = useEditor((s) => (s.activeId ? s.edits[s.activeId].crop : null))
  const activePhoto = useEditor((s) => (s.activeId ? s.photos[s.activeId] : null))
  const [size, setSize] = useState({ w: 0, h: 0 })

  const requestRender = () => {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      rendererRef.current?.render()
    })
  }

  // Setup the renderer + observers once. Survives WebGL context loss.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const applyStoreState = (r: DevelopRenderer) => {
      const st = useEditor.getState()
      const img = st.activeId ? getImage(st.activeId) : undefined
      if (img) r.setImage(img.bitmap, img.width, img.height)
      r.setParams(st.activeId ? st.edits[st.activeId] : DEFAULT_PARAMS)
      r.setView(st.view)
    }
    const init = () => {
      try {
        const r = new DevelopRenderer(canvas)
        rendererRef.current = r
        r.resize()
        applyStoreState(r)
        requestRender()
        setError(null)
      } catch (e) {
        setError((e as Error).message)
      }
    }
    init()

    const ro = new ResizeObserver(() => {
      rendererRef.current?.resize()
      setSize({ w: canvas.clientWidth, h: canvas.clientHeight })
      requestRender()
    })
    ro.observe(canvas)
    setSize({ w: canvas.clientWidth, h: canvas.clientHeight })

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const st = useEditor.getState()
      const dz = Math.exp(-e.deltaY * 0.0015)
      st.setView({ zoom: Math.min(8, Math.max(1, st.view.zoom * dz)) })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })

    // Context loss: prevent default so the browser can restore, then rebuild.
    const onLost = (e: Event) => {
      e.preventDefault()
      rendererRef.current = null
    }
    const onRestored = () => init()
    canvas.addEventListener('webglcontextlost', onLost, false)
    canvas.addEventListener('webglcontextrestored', onRestored, false)

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null // MUST null it, or StrictMode remount dead-locks requestRender
      }
      ro.disconnect()
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      rendererRef.current?.dispose()
      rendererRef.current = null
    }
  }, [])

  // Active image changed -> upload texture.
  useEffect(() => {
    const r = rendererRef.current
    if (!r || !activeId) return
    const img = getImage(activeId)
    if (!img) return
    const st = useEditor.getState()
    r.setImage(img.bitmap, img.width, img.height)
    r.setParams(st.edits[activeId] ?? DEFAULT_PARAMS) // don't rely on the params effect's ordering
    r.setView(st.view)
    r.resize()
    requestRender()
  }, [activeId])

  // Params / view / compare changed -> re-render. While comparing, draw the
  // unedited original (DEFAULT_PARAMS) so the user sees exactly what the edit did.
  useEffect(() => {
    const r = rendererRef.current
    if (!r) return
    const p = compare ? DEFAULT_PARAMS : params
    r.setParams(p)
    // Resolve the LUT reference to its registry data for the renderer.
    const lr = p.lut
    const d = lr ? getLutData(lr.id) : undefined
    r.setLut(lr && d ? { id: lr.id, size: d.size, data: d.data, amount: lr.amount } : null)
    r.setView(view)
    requestRender()
  }, [params, view, compare])

  const onPointerDown = (e: React.PointerEvent) => {
    if (view.zoom <= 1) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const c = canvasRef.current
    if (!c) return
    const dx = ((e.clientX - d.x) / c.clientWidth) * 2
    const dy = (-(e.clientY - d.y) / c.clientHeight) * 2
    dragRef.current = { x: e.clientX, y: e.clientY }
    const st = useEditor.getState()
    st.setView({ panX: st.view.panX + dx, panY: st.view.panY + dy })
  }
  const onPointerUp = () => {
    dragRef.current = null
  }

  if (error) {
    return (
      <div className="grid h-full place-items-center bg-canvas px-6 text-center text-sm text-fg-muted">
        WebGL2 is unavailable on this device. {error}
      </div>
    )
  }

  // Crop overlay: dim outside the crop, gold border. Geometry tracks contain-fit + zoom/pan.
  let overlay: CSSProperties | null = null
  if (crop && activePhoto && size.w > 0 && size.h > 0) {
    const imgA = activePhoto.width / activePhoto.height
    const viewA = size.w / size.h
    const sx = imgA > viewA ? 1 : imgA / viewA
    const sy = imgA > viewA ? viewA / imgA : 1
    const dispW = sx * view.zoom * size.w
    const dispH = sy * view.zoom * size.h
    const imgLeft = size.w / 2 + view.panX * (size.w / 2) - dispW / 2
    const imgTop = size.h / 2 - view.panY * (size.h / 2) - dispH / 2
    overlay = {
      position: 'absolute',
      left: imgLeft + crop.x * dispW,
      top: imgTop + crop.y * dispH,
      width: crop.w * dispW,
      height: crop.h * dispH,
      boxShadow: '0 0 0 9999px rgba(10, 10, 11, 0.55)',
      outline: '1px solid var(--accent)',
      pointerEvents: 'none',
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-canvas">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={compare ? 'Photo preview (showing original)' : 'Photo preview'}
        className="block h-full w-full"
        style={{ cursor: view.zoom > 1 ? 'grab' : 'default', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => useEditor.getState().resetView()}
      />
      {overlay && <div style={overlay} />}
      {compare && activeId && (
        <div className="pointer-events-none absolute left-3 top-3 rounded border border-hairline bg-raised px-2 py-1 text-[11px] tracking-wide text-fg-dim">
          Before
        </div>
      )}
      {!activeId && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-fg-muted">
          Import a photo to begin
        </div>
      )}
    </div>
  )
}

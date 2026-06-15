import { useEffect, useRef, useState } from 'react'
import { DevelopRenderer } from '../engine/pipeline'
import { useEditor, getImage } from '../store/editor'
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
  const view = useEditor((s) => s.view)

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
      requestRender()
    })
    ro.observe(canvas)

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
    r.setImage(img.bitmap, img.width, img.height)
    r.resize()
    requestRender()
  }, [activeId])

  // Params / view changed -> re-render.
  useEffect(() => {
    const r = rendererRef.current
    if (!r) return
    r.setParams(params)
    r.setView(view)
    requestRender()
  }, [params, view])

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

  return (
    <div className="relative h-full w-full bg-canvas">
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        style={{ cursor: view.zoom > 1 ? 'grab' : 'default', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => useEditor.getState().resetView()}
      />
      {!activeId && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-fg-muted">
          Import a photo to begin
        </div>
      )}
    </div>
  )
}

import { useRef, useState } from 'react'
import { useEditor } from '../store/editor'
import { loadImageFile } from './import'

/** First-run / no-photos state. The free no-login tool IS the landing/funnel
 *  (docs/PRD.md, docs/UX-SPEC.md). Drop or pick photos to enter the editor. */
export function FunnelHero() {
  const fileRef = useRef<HTMLInputElement>(null)
  const addPhoto = useEditor((s) => s.addPhoto)
  const [drag, setDrag] = useState(false)

  const onFiles = async (files: FileList | null) => {
    if (!files) return
    for (const f of Array.from(files)) {
      try {
        const { meta, bitmap, bytes } = await loadImageFile(f)
        addPhoto(meta, bitmap, bytes)
      } catch (e) {
        console.error(e)
        alert((e as Error).message)
      }
    }
  }

  return (
    <div
      className="grid h-full place-items-center bg-canvas px-6"
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        void onFiles(e.dataTransfer.files)
      }}
    >
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 h-3 w-3 rounded-sm bg-accent" aria-hidden />
        <h1 className="mb-2 text-2xl font-medium tracking-tight text-fg">
          Match any look. Edit every slider.
        </h1>
        <p className="mx-auto mb-6 max-w-sm text-sm leading-relaxed text-fg-muted">
          Drop a reference look and your photos. Halcyon fits the look into real, editable
          controls — and normalizes a whole batch so nothing blows out.
        </p>
        <button
          onClick={() => fileRef.current?.click()}
          className={`mx-auto block w-full max-w-sm rounded-lg border border-dashed px-6 py-10 text-sm transition-colors ${
            drag
              ? 'border-accent text-fg'
              : 'border-hairline-strong text-fg-muted hover:border-accent hover:text-fg-dim'
          }`}
        >
          Drop photos here, or click to import
        </button>
        <div className="mt-6 flex justify-center gap-6 text-[11px] text-fg-faint">
          <span>1 · Drop a reference</span>
          <span>2 · Apply match</span>
          <span>3 · Tune &amp; export</span>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/tiff,image/webp"
          multiple
          className="hidden"
          onChange={(e) => void onFiles(e.target.files)}
        />
      </div>
    </div>
  )
}

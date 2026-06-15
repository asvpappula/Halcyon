// Full-resolution export: render the source through the same shader at the target size
// (off-screen, own GL context so the live canvas is untouched), then encode to a Blob.
// docs/FEATURES.md (P2 export).

import type { ControlParams } from './types'
import { buildProgram, PARAM_MAP } from './pipeline'

export type ExportFormat = 'image/jpeg' | 'image/png' | 'image/webp'

export interface ExportOptions {
  format: ExportFormat
  quality?: number // 0..1, for jpeg/webp
  maxEdge?: number // longest-edge cap in px; omitted = original size
}

export async function exportPhoto(
  source: ImageBitmap,
  params: ControlParams,
  opts: ExportOptions,
): Promise<Blob> {
  const { format, quality = 0.92, maxEdge } = opts
  let w = source.width
  let h = source.height
  if (maxEdge && Math.max(w, h) > maxEdge) {
    const s = maxEdge / Math.max(w, h)
    w = Math.max(1, Math.round(w * s))
    h = Math.max(1, Math.round(h * s))
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const gl = canvas.getContext('webgl2', {
    preserveDrawingBuffer: true,
    antialias: false,
    premultipliedAlpha: false,
  })
  if (!gl) throw new Error('WebGL2 unavailable for export')

  const prog = buildProgram(gl)
  const vao = gl.createVertexArray()!
  gl.bindVertexArray(vao)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  )
  const aPos = gl.getAttribLocation(prog, 'aPos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)

  gl.useProgram(prog)
  gl.uniform1i(gl.getUniformLocation(prog, 'uImage'), 0)
  gl.uniform2f(gl.getUniformLocation(prog, 'uScale'), 1, 1) // fill the export canvas, no letterbox
  gl.uniform2f(gl.getUniformLocation(prog, 'uOffset'), 0, 0)
  for (const [key, name] of PARAM_MAP) gl.uniform1f(gl.getUniformLocation(prog, name), params[key])

  gl.viewport(0, 0, w, h)
  gl.clearColor(0, 0, 0, 1)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.drawArrays(gl.TRIANGLES, 0, 6)

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, format, quality))

  gl.deleteTexture(tex)
  gl.deleteBuffer(buf)
  gl.deleteVertexArray(vao)
  gl.deleteProgram(prog)
  gl.getExtension('WEBGL_lose_context')?.loseContext()

  if (!blob) throw new Error('Export encoding failed')
  return blob
}

/** Trigger a browser download of a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

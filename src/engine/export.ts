// Full-resolution export: render the source through the same shader at native size
// (off-screen, own GL context so the live canvas is untouched), then crop + resize in 2D
// and encode to a Blob. docs/FEATURES.md (P2 export).

import type { ControlParams } from './types'
import { buildProgram, PARAM_MAP } from './pipeline'

export type ExportFormat = 'image/jpeg' | 'image/png' | 'image/webp'

export interface ExportOptions {
  format: ExportFormat
  quality?: number // 0..1, for jpeg/webp
  maxEdge?: number // longest-edge cap in px; omitted = full size
}

export async function exportPhoto(
  source: ImageBitmap,
  params: ControlParams,
  opts: ExportOptions,
): Promise<Blob> {
  const { format, quality = 0.92, maxEdge } = opts
  const imgW = source.width
  const imgH = source.height

  // 1) Render the full image through the develop shader at native resolution.
  const glCanvas = document.createElement('canvas')
  glCanvas.width = imgW
  glCanvas.height = imgH
  const gl = glCanvas.getContext('webgl2', {
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
  gl.uniform2f(gl.getUniformLocation(prog, 'uScale'), 1, 1)
  gl.uniform2f(gl.getUniformLocation(prog, 'uOffset'), 0, 0)
  for (const [key, name] of PARAM_MAP) gl.uniform1f(gl.getUniformLocation(prog, name), params[key])

  gl.viewport(0, 0, imgW, imgH)
  gl.clearColor(0, 0, 0, 1)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.drawArrays(gl.TRIANGLES, 0, 6)

  // 2) Crop region (px), top-left origin.
  const crop = params.crop
  const sx = crop ? Math.round(crop.x * imgW) : 0
  const sy = crop ? Math.round(crop.y * imgH) : 0
  const sw = crop ? Math.max(1, Math.round(crop.w * imgW)) : imgW
  const sh = crop ? Math.max(1, Math.round(crop.h * imgH)) : imgH

  // 3) Output dims after longest-edge resize.
  let outW = sw
  let outH = sh
  if (maxEdge && Math.max(sw, sh) > maxEdge) {
    const s = maxEdge / Math.max(sw, sh)
    outW = Math.max(1, Math.round(sw * s))
    outH = Math.max(1, Math.round(sh * s))
  }

  // 4) Crop + resize in 2D, then encode.
  const out = document.createElement('canvas')
  out.width = outW
  out.height = outH
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('2D context unavailable for export')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(glCanvas, sx, sy, sw, sh, 0, 0, outW, outH)

  const blob = await new Promise<Blob | null>((res) => out.toBlob(res, format, quality))

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

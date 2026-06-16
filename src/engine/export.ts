// Full-resolution export: render the source through the same shader (own GL context so
// the live canvas is untouched), then crop + resize in 2D and encode to a Blob.
// Caps the render to the GPU's MAX_TEXTURE_SIZE. docs/FEATURES.md (P2 export).

import type { ControlParams } from './types'
import { DEFAULT_COLOR_GRADE } from './types'
import { buildProgram, PARAM_MAP, HSL_UNIFORMS } from './pipeline'
import { buildCurveLut, isCurveActive } from './curve'

const ZERO8 = [0, 0, 0, 0, 0, 0, 0, 0]

export type ExportFormat = 'image/jpeg' | 'image/png' | 'image/webp'

export interface ExportOptions {
  format: ExportFormat
  quality?: number // 0..1, for jpeg/webp
  maxEdge?: number // longest-edge cap in px; omitted = full size
  lut?: { size: number; data: Uint8Array; amount: number } | null // resolved from the registry
}

export async function exportPhoto(
  source: ImageBitmap,
  params: ControlParams,
  opts: ExportOptions,
): Promise<Blob> {
  const { format, quality = 0.92, maxEdge, lut } = opts

  const glCanvas = document.createElement('canvas')
  glCanvas.width = 1
  glCanvas.height = 1
  const gl = glCanvas.getContext('webgl2', {
    preserveDrawingBuffer: true,
    antialias: false,
    premultipliedAlpha: false,
  })
  if (!gl) throw new Error('WebGL2 unavailable for export')

  // Render size: source capped to the GPU's max texture size (huge images don't blow up).
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
  let renderW = source.width
  let renderH = source.height
  if (Math.max(renderW, renderH) > maxTex) {
    const s = maxTex / Math.max(renderW, renderH)
    renderW = Math.max(1, Math.floor(renderW * s))
    renderH = Math.max(1, Math.floor(renderH * s))
  }
  glCanvas.width = renderW
  glCanvas.height = renderH

  // If capped, downscale the source via a 2D canvas to use as the texture.
  let texSource: TexImageSource = source
  if (renderW !== source.width || renderH !== source.height) {
    const scratch = document.createElement('canvas')
    scratch.width = renderW
    scratch.height = renderH
    const sctx = scratch.getContext('2d')
    if (!sctx) throw new Error('2D context unavailable for export')
    sctx.imageSmoothingQuality = 'high'
    sctx.drawImage(source, 0, 0, renderW, renderH)
    texSource = scratch
  }

  let prog: WebGLProgram | null = null
  let vao: WebGLVertexArrayObject | null = null
  let buf: WebGLBuffer | null = null
  let tex: WebGLTexture | null = null
  let curveTex: WebGLTexture | null = null
  let lutTex: WebGLTexture | null = null
  try {
    prog = buildProgram(gl)
    vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    )
    const aPos = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texSource)

    gl.useProgram(prog)
    gl.uniform1i(gl.getUniformLocation(prog, 'uImage'), 0)
    gl.uniform2f(gl.getUniformLocation(prog, 'uScale'), 1, 1)
    gl.uniform2f(gl.getUniformLocation(prog, 'uOffset'), 0, 0)
    for (const [key, name] of PARAM_MAP) gl.uniform1f(gl.getUniformLocation(prog, name), params[key])
    for (const [key, name] of HSL_UNIFORMS)
      gl.uniform1fv(gl.getUniformLocation(prog, name), params[key] ?? ZERO8)
    const cg = params.colorGrade ?? DEFAULT_COLOR_GRADE()
    gl.uniform3f(gl.getUniformLocation(prog, 'uCgSh'), cg.sh[0], cg.sh[1], cg.sh[2])
    gl.uniform3f(gl.getUniformLocation(prog, 'uCgMid'), cg.mid[0], cg.mid[1], cg.mid[2])
    gl.uniform3f(gl.getUniformLocation(prog, 'uCgHi'), cg.hi[0], cg.hi[1], cg.hi[2])
    gl.uniform1f(gl.getUniformLocation(prog, 'uCgBalance'), cg.balance)
    gl.uniform2f(gl.getUniformLocation(prog, 'uTexel'), renderW ? 1 / renderW : 0, renderH ? 1 / renderH : 0)

    const curveActive = isCurveActive(params.curves)
    gl.uniform1f(gl.getUniformLocation(prog, 'uCurveActive'), curveActive ? 1 : 0)
    if (curveActive && params.curves) {
      curveTex = gl.createTexture()
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, curveTex)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildCurveLut(params.curves))
      gl.uniform1i(gl.getUniformLocation(prog, 'uCurve'), 1)
      gl.activeTexture(gl.TEXTURE0)
    }

    gl.uniform1i(gl.getUniformLocation(prog, 'uLut'), 2)
    gl.uniform1f(gl.getUniformLocation(prog, 'uLutActive'), lut ? 1 : 0)
    if (lut) {
      lutTex = gl.createTexture()
      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_3D, lutTex)
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE)
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA, lut.size, lut.size, lut.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut.data)
      gl.uniform1f(gl.getUniformLocation(prog, 'uLutAmount'), lut.amount)
      gl.uniform1f(gl.getUniformLocation(prog, 'uLutSize'), lut.size)
      gl.activeTexture(gl.TEXTURE0)
    }

    gl.viewport(0, 0, renderW, renderH)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    // Crop region in render-space px, clamped within bounds.
    const crop = params.crop
    let sx = crop ? Math.round(crop.x * renderW) : 0
    let sy = crop ? Math.round(crop.y * renderH) : 0
    sx = Math.max(0, Math.min(sx, renderW - 1))
    sy = Math.max(0, Math.min(sy, renderH - 1))
    let sw = crop ? Math.round(crop.w * renderW) : renderW
    let sh = crop ? Math.round(crop.h * renderH) : renderH
    sw = Math.max(1, Math.min(sw, renderW - sx))
    sh = Math.max(1, Math.min(sh, renderH - sy))

    // Output dims after longest-edge resize.
    let outW = sw
    let outH = sh
    if (maxEdge && Math.max(sw, sh) > maxEdge) {
      const s = maxEdge / Math.max(sw, sh)
      outW = Math.max(1, Math.round(sw * s))
      outH = Math.max(1, Math.round(sh * s))
    }

    const out = document.createElement('canvas')
    out.width = outW
    out.height = outH
    const ctx = out.getContext('2d')
    if (!ctx) throw new Error('2D context unavailable for export')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(glCanvas, sx, sy, sw, sh, 0, 0, outW, outH)

    const blob = await new Promise<Blob | null>((res) => out.toBlob(res, format, quality))
    if (!blob) throw new Error('Export encoding failed')
    return blob
  } finally {
    if (tex) gl.deleteTexture(tex)
    if (curveTex) gl.deleteTexture(curveTex)
    if (lutTex) gl.deleteTexture(lutTex)
    if (buf) gl.deleteBuffer(buf)
    if (vao) gl.deleteVertexArray(vao)
    if (prog) gl.deleteProgram(prog)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
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

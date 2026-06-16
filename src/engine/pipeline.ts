// WebGL2 develop renderer: uploads an image, applies ControlParams via the shader
// (which mirrors ops.ts), and draws to a canvas with contain-fit + zoom/pan.
// Renders on demand (no RAF loop). docs/ARCHITECTURE.md §1.

import type { ControlParams, DevelopKey } from './types'
import { DEFAULT_PARAMS, DEFAULT_COLOR_GRADE } from './types'
import { VERT, FRAG } from './shaders'
import { buildCurveLut, isCurveActive, type CurveSet } from './curve'

export const PARAM_MAP: [DevelopKey, string][] = [
  ['exposure', 'uExposure'],
  ['contrast', 'uContrast'],
  ['highlights', 'uHighlights'],
  ['shadows', 'uShadows'],
  ['whites', 'uWhites'],
  ['blacks', 'uBlacks'],
  ['temp', 'uTemp'],
  ['tint', 'uTint'],
  ['vibrance', 'uVibrance'],
  ['saturation', 'uSaturation'],
  ['sharpen', 'uSharpen'],
  ['noiseReduction', 'uNoiseReduction'],
  ['vignette', 'uVignette'],
  ['grain', 'uGrain'],
  ['texture', 'uTexture'],
  ['clarity', 'uClarity'],
  ['dehaze', 'uDehaze'],
]

// HSL array uniforms — set together with uniform1fv (render-only color mixer).
export const HSL_UNIFORMS: [keyof Pick<ControlParams, 'hslHue' | 'hslSat' | 'hslLum'>, string][] = [
  ['hslHue', 'uHslHue'],
  ['hslSat', 'uHslSat'],
  ['hslLum', 'uHslLum'],
]
const ZERO8 = [0, 0, 0, 0, 0, 0, 0, 0]
// Cap the on-screen working texture. The display canvas is far smaller than a modern
// photo, so a proxy renders identically while using a fraction of the GPU memory/upload
// — and never exceeds MAX_TEXTURE_SIZE (huge images would otherwise fail to upload).
// Export uses its own full-res path, so output quality is unaffected.
const DISPLAY_MAX = 4096

export interface View {
  zoom: number
  panX: number // clip-space offset, -1..1
  panY: number
}
export const DEFAULT_VIEW: View = { zoom: 1, panX: 0, panY: 0 }

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)
  if (!sh) throw new Error('createShader failed')
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error('Shader compile error: ' + log)
  }
  return sh
}

export function buildProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
  const prog = gl.createProgram()
  if (!prog) throw new Error('createProgram failed')
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog)
    gl.deleteProgram(prog)
    throw new Error('Program link error: ' + log)
  }
  return prog
}

export class DevelopRenderer {
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private vao: WebGLVertexArrayObject
  private tex: WebGLTexture | null = null
  private curveTex: WebGLTexture | null = null
  private lastCurves: CurveSet | null | undefined = undefined
  private curveActive = false
  private lutTex: WebGLTexture | null = null
  private lutInput: { id: string; size: number; data: Uint8Array; amount: number } | null = null
  private lastLutId: string | null = null
  private uni: Record<string, WebGLUniformLocation | null> = {}
  private imgW = 0
  private imgH = 0
  private maxTex = 4096
  private params: ControlParams = { ...DEFAULT_PARAMS }
  private view: View = { ...DEFAULT_VIEW }

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
    })
    if (!gl) throw new Error('WebGL2 not supported on this device')
    this.gl = gl
    this.maxTex = (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) || 4096
    this.program = buildProgram(gl)

    const vao = gl.createVertexArray()
    if (!vao) throw new Error('createVertexArray failed')
    this.vao = vao
    gl.bindVertexArray(vao)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    // two triangles covering clip space
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    )
    const aPos = gl.getAttribLocation(this.program, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)

    gl.useProgram(this.program)
    const names = ['uScale', 'uOffset', 'uImage', 'uTexel', 'uCurve', 'uCurveActive', 'uLut', 'uLutActive', 'uLutAmount', 'uLutSize', 'uCgSh', 'uCgMid', 'uCgHi', 'uCgBalance', ...PARAM_MAP.map((p) => p[1]), ...HSL_UNIFORMS.map((p) => p[1])]
    for (const name of names) {
      this.uni[name] = gl.getUniformLocation(this.program, name)
    }
    gl.clearColor(0, 0, 0, 0)
  }

  get hasImage(): boolean {
    return this.tex !== null
  }
  get imageSize(): { w: number; h: number } {
    return { w: this.imgW, h: this.imgH }
  }

  setImage(src: TexImageSource, w: number, h: number): void {
    const gl = this.gl
    if (!this.tex) this.tex = gl.createTexture()
    // Downscale to a display proxy if the image exceeds the cap (aspect preserved).
    const cap = Math.min(this.maxTex, DISPLAY_MAX)
    let texSrc: TexImageSource = src
    let tw = w
    let th = h
    const drawable = !(typeof ImageData !== 'undefined' && src instanceof ImageData)
    if (Math.max(w, h) > cap && drawable) {
      const s = cap / Math.max(w, h)
      tw = Math.max(1, Math.round(w * s))
      th = Math.max(1, Math.round(h * s))
      const scratch = document.createElement('canvas')
      scratch.width = tw
      scratch.height = th
      const ctx = scratch.getContext('2d')
      if (ctx) {
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(src as CanvasImageSource, 0, 0, tw, th)
        texSrc = scratch
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texSrc)
    this.imgW = tw
    this.imgH = th
  }

  setParams(p: ControlParams): void {
    this.params = p
  }
  setView(v: View): void {
    this.view = v
  }
  // Resolved LUT (data looked up from the registry by the caller). null = no LUT.
  setLut(lut: { id: string; size: number; data: Uint8Array; amount: number } | null): void {
    this.lutInput = lut
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr))
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    this.gl.viewport(0, 0, w, h)
  }

  private fitScale(): [number, number] {
    const cw = this.canvas.width
    const ch = this.canvas.height
    if (!this.imgW || !this.imgH || !cw || !ch) return [1, 1]
    const Va = cw / ch
    const Ia = this.imgW / this.imgH
    return Ia > Va ? [1, Va / Ia] : [Ia / Va, 1]
  }

  // Rebuild + upload the tone-curve LUT only when the curve set reference changes.
  private syncCurve(): void {
    const gl = this.gl
    const curves = this.params.curves
    if (curves === this.lastCurves) return
    this.lastCurves = curves
    this.curveActive = isCurveActive(curves)
    if (this.curveActive && curves) {
      if (!this.curveTex) this.curveTex = gl.createTexture()
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, this.curveTex)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildCurveLut(curves))
      gl.activeTexture(gl.TEXTURE0)
    }
  }

  // Upload the 3D LUT volume only when the referenced LUT id changes.
  private syncLut(): void {
    const gl = this.gl
    const lut = this.lutInput
    if (!lut || lut.id === this.lastLutId) return
    this.lastLutId = lut.id
    if (!this.lutTex) this.lutTex = gl.createTexture()
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE)
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA, lut.size, lut.size, lut.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut.data)
    gl.activeTexture(gl.TEXTURE0)
  }

  render(): void {
    const gl = this.gl
    gl.clear(gl.COLOR_BUFFER_BIT)
    if (!this.tex) return
    gl.useProgram(this.program)
    gl.bindVertexArray(this.vao)
    this.syncCurve()
    this.syncLut()
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.uniform1i(this.uni.uImage, 0)
    for (const [key, name] of PARAM_MAP) gl.uniform1f(this.uni[name], this.params[key])
    for (const [key, name] of HSL_UNIFORMS) gl.uniform1fv(this.uni[name], this.params[key] ?? ZERO8)
    const cg = this.params.colorGrade ?? DEFAULT_COLOR_GRADE()
    gl.uniform3f(this.uni.uCgSh, cg.sh[0], cg.sh[1], cg.sh[2])
    gl.uniform3f(this.uni.uCgMid, cg.mid[0], cg.mid[1], cg.mid[2])
    gl.uniform3f(this.uni.uCgHi, cg.hi[0], cg.hi[1], cg.hi[2])
    gl.uniform1f(this.uni.uCgBalance, cg.balance)
    gl.uniform2f(this.uni.uTexel, this.imgW ? 1 / this.imgW : 0, this.imgH ? 1 / this.imgH : 0)
    gl.uniform1f(this.uni.uCurveActive, this.curveActive ? 1 : 0)
    if (this.curveActive && this.curveTex) {
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, this.curveTex)
      gl.uniform1i(this.uni.uCurve, 1)
      gl.activeTexture(gl.TEXTURE0)
    }
    // uLut always points at unit 2 (a sampler3D must not share a unit with sampler2D uImage).
    gl.uniform1i(this.uni.uLut, 2)
    const lutOn = !!this.lutInput && !!this.lutTex
    gl.uniform1f(this.uni.uLutActive, lutOn ? 1 : 0)
    if (lutOn && this.lutInput) {
      gl.uniform1f(this.uni.uLutAmount, this.lutInput.amount)
      gl.uniform1f(this.uni.uLutSize, this.lutInput.size)
      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_3D, this.lutTex)
      gl.activeTexture(gl.TEXTURE0)
    }
    const [sx, sy] = this.fitScale()
    gl.uniform2f(this.uni.uScale, sx * this.view.zoom, sy * this.view.zoom)
    gl.uniform2f(this.uni.uOffset, this.view.panX, this.view.panY)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.bindVertexArray(null)
  }

  dispose(): void {
    // Delete our resources but do NOT loseContext(): a canvas caches its WebGL
    // context, so under React StrictMode's mount→unmount→mount the remount would
    // otherwise reuse a dead context. The context is freed when the canvas is GC'd.
    const gl = this.gl
    if (this.tex) gl.deleteTexture(this.tex)
    if (this.curveTex) gl.deleteTexture(this.curveTex)
    if (this.lutTex) gl.deleteTexture(this.lutTex)
    gl.deleteVertexArray(this.vao)
    gl.deleteProgram(this.program)
  }
}

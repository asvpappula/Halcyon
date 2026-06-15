// WebGL2 develop renderer: uploads an image, applies ControlParams via the shader
// (which mirrors ops.ts), and draws to a canvas with contain-fit + zoom/pan.
// Renders on demand (no RAF loop). docs/ARCHITECTURE.md §1.

import type { ControlParams, DevelopKey } from './types'
import { DEFAULT_PARAMS } from './types'
import { VERT, FRAG } from './shaders'

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
]

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
  private uni: Record<string, WebGLUniformLocation | null> = {}
  private imgW = 0
  private imgH = 0
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
    for (const name of ['uScale', 'uOffset', 'uImage', ...PARAM_MAP.map((p) => p[1])]) {
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
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
    this.imgW = w
    this.imgH = h
  }

  setParams(p: ControlParams): void {
    this.params = p
  }
  setView(v: View): void {
    this.view = v
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

  render(): void {
    const gl = this.gl
    gl.clear(gl.COLOR_BUFFER_BIT)
    if (!this.tex) return
    gl.useProgram(this.program)
    gl.bindVertexArray(this.vao)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.uniform1i(this.uni.uImage, 0)
    for (const [key, name] of PARAM_MAP) gl.uniform1f(this.uni[name], this.params[key])
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
    gl.deleteVertexArray(this.vao)
    gl.deleteProgram(this.program)
  }
}

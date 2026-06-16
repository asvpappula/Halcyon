// Equivalence gate (ARCHITECTURE §2.1): render test colors through the GLSL shader,
// read back, and compare to applyParams (the forward model) in Lab. Any delta beyond
// 8-bit output quantization means the shader and ops.ts have drifted — which would make
// fitted sliders reproduce the wrong look and the match-strength readout lie.
// Runs in the browser (needs a WebGL2 context); called in DEV from App.

import { buildProgram } from './pipeline'
import { applyParams } from './ops'
import { clamp, deltaE2000, linearRgbToLab, srgbToLinear, linearToSrgb } from './color'
import { DEFAULT_PARAMS, type ControlParams, type DevelopKey, type LinearRGB } from './types'

export interface EquivResult {
  median: number
  max: number
  n: number
  pass: boolean
}

const PMAP: [DevelopKey, string][] = [
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

export function runEquivalenceCheck(trials = 8): EquivResult {
  const vals = [0.05, 0.2, 0.4, 0.6, 0.8, 0.95]
  const colors: LinearRGB[] = []
  for (const r of vals) for (const g of vals) for (const b of vals) colors.push([r, g, b])
  const N = colors.length

  // sRGB-encoded 8-bit input + the exact quantized-linear the shader will recover.
  const bytes = new Uint8ClampedArray(N * 4)
  const srcQ: LinearRGB[] = new Array(N)
  for (let i = 0; i < N; i++) {
    const r = Math.round(linearToSrgb(colors[i][0]) * 255)
    const g = Math.round(linearToSrgb(colors[i][1]) * 255)
    const b = Math.round(linearToSrgb(colors[i][2]) * 255)
    bytes[i * 4] = r
    bytes[i * 4 + 1] = g
    bytes[i * 4 + 2] = b
    bytes[i * 4 + 3] = 255
    srcQ[i] = [srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)]
  }

  const canvas = document.createElement('canvas')
  canvas.width = N
  canvas.height = 1
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false })
  if (!gl) throw new Error('WebGL2 unavailable for equivalence check')
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
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, new ImageData(bytes, N, 1))

  gl.useProgram(prog)
  gl.uniform1i(gl.getUniformLocation(prog, 'uImage'), 0)
  gl.uniform2f(gl.getUniformLocation(prog, 'uScale'), 1, 1)
  gl.uniform2f(gl.getUniformLocation(prog, 'uOffset'), 0, 0)
  // uLut is a sampler3D: put it on its own unit so it doesn't collide with uImage (unit 0).
  // uLutActive defaults to 0, so it's never sampled here — this just satisfies validation.
  gl.uniform1i(gl.getUniformLocation(prog, 'uLut'), 2)
  gl.viewport(0, 0, N, 1)

  let seed = 0x2545f491
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return (seed / 0x7fffffff) * 2 - 1
  }
  const out = new Uint8Array(N * 4)
  const des: number[] = []
  for (let t = 0; t < trials; t++) {
    const p: ControlParams = { ...DEFAULT_PARAMS }
    for (const [k] of PMAP) p[k] = rnd() * 60
    for (const [key, name] of PMAP) gl.uniform1f(gl.getUniformLocation(prog, name), p[key])
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.readPixels(0, 0, N, 1, gl.RGBA, gl.UNSIGNED_BYTE, out)
    for (let i = 0; i < N; i++) {
      const shaderLin: LinearRGB = [
        srgbToLinear(out[i * 4] / 255),
        srgbToLinear(out[i * 4 + 1] / 255),
        srgbToLinear(out[i * 4 + 2] / 255),
      ]
      const fm = applyParams(srcQ[i], p)
      const fmC: LinearRGB = [clamp(fm[0], 0, 1), clamp(fm[1], 0, 1), clamp(fm[2], 0, 1)]
      const a = linearRgbToLab(shaderLin)
      const b = linearRgbToLab(fmC)
      des.push(deltaE2000(a[0], a[1], a[2], b[0], b[1], b[2]))
    }
  }
  des.sort((a, b) => a - b)

  gl.deleteTexture(tex)
  gl.deleteBuffer(buf)
  gl.deleteVertexArray(vao)
  gl.deleteProgram(prog)
  gl.getExtension('WEBGL_lose_context')?.loseContext()

  const median = des[Math.floor(des.length / 2)]
  const max = des[des.length - 1]
  // Tolerance allows 8-bit output quantization only.
  return { median, max, n: des.length, pass: median < 1.0 && max < 2.5 }
}

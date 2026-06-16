// The cinematic Three.js backdrop for the landing page: a slow particle light-field,
// drifting gold-edged "film frames", and a scroll-reactive color aurora. Lives in its
// own module so Vite code-splits three out of the editor bundle (dynamic-imported by
// Landing after first paint). Warm gold + cool slate palette, neutral and restrained.

import * as THREE from 'three'

export interface HeroSceneHandle {
  setScroll: (progress: number) => void
  dispose: () => void
}

const GOLD = new THREE.Color(0.79, 0.66, 0.38)
const COOL = new THREE.Color(0.32, 0.5, 0.82)
const WHITE = new THREE.Color(0.88, 0.9, 0.96)

export function createHeroScene(canvas: HTMLCanvasElement): HeroSceneHandle {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
  camera.position.z = 14

  // --- Aurora: a fullscreen clip-space quad behind everything ---
  const auroraMat = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uScroll: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }`,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      uniform float uScroll;
      vec3 palette(float t){
        vec3 deep = vec3(0.035, 0.035, 0.045);
        vec3 cool = vec3(0.12, 0.18, 0.34);
        vec3 gold = vec3(0.79, 0.66, 0.38);
        vec3 c = mix(deep, cool, smoothstep(0.0, 0.65, t));
        c = mix(c, gold, smoothstep(0.6, 1.0, t) * 0.7);
        return c;
      }
      void main(){
        vec2 uv = vUv;
        float wave = sin(uv.x * 3.0 + uTime * 0.12) * 0.10 + sin(uv.x * 6.0 - uTime * 0.08) * 0.05;
        float t = clamp(uv.y * 0.9 + wave + uScroll * 0.5, 0.0, 1.0);
        vec3 col = palette(t);
        float d = distance(uv, vec2(0.5, 0.42));
        col *= 1.0 - d * 0.65;         // soft vignette
        gl_FragColor = vec4(col * 0.78, 1.0);
      }`,
  })
  const aurora = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), auroraMat)
  aurora.frustumCulled = false
  aurora.renderOrder = -10
  scene.add(aurora)

  // --- Particle light-field ---
  const COUNT = window.innerWidth < 768 ? 1400 : 3200
  const pGeo = new THREE.BufferGeometry()
  const pos = new Float32Array(COUNT * 3)
  const col = new Float32Array(COUNT * 3)
  const seed = new Float32Array(COUNT)
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * 20
    pos[i * 3 + 1] = (Math.random() * 2 - 1) * 12
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * 9 - 2
    const r = Math.random()
    const c = r < 0.55 ? COOL : r < 0.82 ? WHITE : GOLD
    col[i * 3] = c.r
    col[i * 3 + 1] = c.g
    col[i * 3 + 2] = c.b
    seed[i] = Math.random() * 6.2832
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  pGeo.setAttribute('aColor', new THREE.BufferAttribute(col, 3))
  pGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  const pMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uSize: { value: window.innerWidth < 768 ? 2.3 : 3.1 } },
    vertexShader: `
      attribute vec3 aColor; attribute float aSeed;
      varying vec3 vColor; varying float vTw;
      uniform float uTime; uniform float uSize;
      void main(){
        vColor = aColor;
        vec3 p = position;
        p.x += sin(uTime * 0.18 + aSeed) * 0.5;
        p.y += cos(uTime * 0.13 + aSeed * 1.3) * 0.5;
        vTw = 0.55 + 0.45 * sin(uTime * 1.4 + aSeed * 3.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (12.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      precision highp float;
      varying vec3 vColor; varying float vTw;
      void main(){
        float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(vColor, a * vTw * 0.9);
      }`,
  })
  const points = new THREE.Points(pGeo, pMat)
  scene.add(points)

  // --- Drifting film frames ---
  const frameGeo = new THREE.PlaneGeometry(3.2, 2.1)
  const frameMatProto = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTint: { value: 0.5 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform float uTint;
      void main(){
        vec2 b = min(vUv, 1.0 - vUv);
        float edge = min(b.x, b.y);
        float border = smoothstep(0.0, 0.010, edge) - smoothstep(0.026, 0.04, edge);
        vec3 gold = vec3(0.79, 0.66, 0.38);
        vec3 inner = mix(vec3(0.09, 0.11, 0.15), vec3(0.20, 0.17, 0.13), vUv.x + uTint * 0.3);
        float innerMask = smoothstep(0.04, 0.052, edge);
        vec3 c = inner * innerMask + gold * border;
        gl_FragColor = vec4(c, innerMask * 0.45 + border * 0.9);
      }`,
  })
  const frameGroup = new THREE.Group()
  const frameMats: THREE.ShaderMaterial[] = []
  for (let i = 0; i < 6; i++) {
    const mat = frameMatProto.clone()
    mat.uniforms.uTint.value = Math.random()
    frameMats.push(mat)
    const m = new THREE.Mesh(frameGeo, mat)
    m.position.set((Math.random() * 2 - 1) * 13, (Math.random() * 2 - 1) * 7, (Math.random() * 2 - 1) * 6 - 4)
    m.rotation.z = (Math.random() * 2 - 1) * 0.28
    m.userData.spin = (Math.random() * 2 - 1) * 0.04
    m.userData.phase = Math.random() * 6.28
    frameGroup.add(m)
  }
  scene.add(frameGroup)

  // --- Interaction + loop ---
  let mx = 0
  let my = 0
  let cmx = 0
  let cmy = 0
  const onPointer = (e: PointerEvent) => {
    mx = e.clientX / window.innerWidth - 0.5
    my = e.clientY / window.innerHeight - 0.5
  }
  window.addEventListener('pointermove', onPointer)

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth
    const h = canvas.clientHeight || window.innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  resize()
  window.addEventListener('resize', resize)

  const t0 = performance.now()
  let raf = 0
  const tick = () => {
    const t = (performance.now() - t0) / 1000
    auroraMat.uniforms.uTime.value = t
    pMat.uniforms.uTime.value = t
    cmx += (mx - cmx) * 0.04
    cmy += (my - cmy) * 0.04
    camera.position.x = cmx * 3.2
    camera.position.y = -cmy * 2.2
    camera.lookAt(0, 0, 0)
    points.rotation.y = t * 0.02
    frameGroup.children.forEach((m, i) => {
      m.position.y += Math.sin(t * 0.2 + (m.userData.phase as number)) * 0.0009
      m.rotation.z += (m.userData.spin as number) * 0.01
      void i
    })
    renderer.render(scene, camera)
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  return {
    setScroll: (p: number) => {
      auroraMat.uniforms.uScroll.value = p
      camera.position.z = 14 + p * 4
    },
    dispose: () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('resize', resize)
      pGeo.dispose()
      pMat.dispose()
      aurora.geometry.dispose()
      auroraMat.dispose()
      frameGeo.dispose()
      frameMats.forEach((m) => m.dispose())
      renderer.dispose()
    },
  }
}

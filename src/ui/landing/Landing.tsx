import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { HeroSceneHandle } from './HeroScene'

gsap.registerPlugin(ScrollTrigger)

// CSS grades that stand in for "ungraded original" vs "matched to a warm reference".
const BEFORE = 'saturate(0.7) contrast(0.9) brightness(1.07)'
const AFTER = 'saturate(1.16) contrast(1.1) brightness(0.96) sepia(0.1) hue-rotate(-8deg)'
const img = (seed: string, w: number, h: number) => `https://picsum.photos/seed/${seed}/${w}/${h}`

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const webglOk = () => {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

/** Draggable before/after — the same real photo, ungraded vs matched. Demonstrates the
 *  hero feature directly. Drag (or it sits open) to compare. */
function BeforeAfter({ seed, eager }: { seed: string; eager?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(58)
  const src = img(seed, 1280, 960)
  const move = (clientX: number) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos(Math.max(3, Math.min(97, ((clientX - r.left) / r.width) * 100)))
  }
  return (
    <div
      ref={ref}
      className="group relative aspect-[4/3] w-full cursor-ew-resize select-none overflow-hidden rounded-xl border border-hairline shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        move(e.clientX)
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) move(e.clientX)
      }}
    >
      <img
        src={src}
        alt="Photo matched to a reference look"
        loading={eager ? 'eager' : 'lazy'}
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ filter: AFTER }}
      />
      <img
        src={src}
        alt="The original, ungraded photo"
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ filter: BEFORE, clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />
      <span className="absolute left-3 top-3 rounded bg-black/45 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/80 backdrop-blur-sm">
        Original
      </span>
      <span className="absolute right-3 top-3 rounded bg-black/45 px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent backdrop-blur-sm">
        Matched
      </span>
      <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
        <div className="h-full w-px bg-accent/90" />
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full border border-accent bg-base/80 text-accent backdrop-blur-sm">
          ‹›
        </div>
      </div>
    </div>
  )
}

function MatchRow({ label, value, fill }: { label: string; value: string; fill: number }) {
  return (
    <div className="grid grid-cols-[88px_1fr_52px] items-center gap-3">
      <span className="text-sm text-fg-muted">{label}</span>
      <div className="h-[3px] overflow-hidden rounded-full bg-hairline-strong">
        <div className="match-fill h-full rounded-full bg-accent" style={{ width: `${fill}%` }} />
      </div>
      <span className="tnum text-right text-sm text-fg-dim">{value}</span>
    </div>
  )
}

function FilmMarquee() {
  const seeds = [
    'halcyon-dunes',
    'halcyon-portrait-2',
    'halcyon-coast',
    'halcyon-forest',
    'halcyon-city-night',
    'halcyon-desert',
    'halcyon-studio',
    'halcyon-mountain',
  ]
  const Frame = ({ s }: { s: string }) => (
    <div className="mx-3 h-44 w-64 shrink-0 overflow-hidden rounded-lg border border-hairline">
      <img
        src={img(s, 640, 440)}
        alt=""
        aria-hidden
        loading="lazy"
        className="h-full w-full object-cover"
        style={{ filter: AFTER }}
      />
    </div>
  )
  return (
    <div
      className="relative overflow-hidden py-2"
      style={{
        maskImage: 'linear-gradient(90deg, transparent, black 7%, black 93%, transparent)',
        WebkitMaskImage: 'linear-gradient(90deg, transparent, black 7%, black 93%, transparent)',
      }}
    >
      <div className="marquee-track">
        {seeds.map((s) => (
          <Frame key={s} s={s} />
        ))}
        {seeds.map((s) => (
          <Frame key={s + '-b'} s={s} />
        ))}
      </div>
    </div>
  )
}

export default function Landing({ onEnter }: { onEnter: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<HeroSceneHandle | null>(null)
  const [sceneOn, setSceneOn] = useState(false)

  useEffect(() => {
    const motion = !prefersReduced()
    const use3D = motion && webglOk()
    let cancelled = false

    if (use3D) {
      // Dynamic import defers the heavy Three chunk past first paint on its own.
      void import('./HeroScene')
        .then(({ createHeroScene }) => {
          if (cancelled || !canvasRef.current) return
          sceneRef.current = createHeroScene(canvasRef.current)
          setSceneOn(true)
        })
        .catch(() => {})
    }

    const ctx = gsap.context(() => {
      if (motion) {
        gsap.from('.hero-line', {
          y: 34,
          autoAlpha: 0,
          duration: 1.05,
          ease: 'power3.out',
          stagger: 0.1,
          delay: 0.1,
        })
        gsap.utils.toArray<HTMLElement>('.reveal').forEach((el) => {
          gsap.from(el, {
            y: 46,
            autoAlpha: 0,
            duration: 0.9,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 85%' },
          })
        })
        gsap.from('.match-fill', {
          width: 0,
          duration: 1.1,
          ease: 'power2.out',
          stagger: 0.08,
          scrollTrigger: { trigger: '.match-panel', start: 'top 80%' },
        })
      }
      ScrollTrigger.create({
        trigger: rootRef.current,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.5,
        onUpdate: (self) => sceneRef.current?.setScroll(self.progress),
      })
    }, rootRef)

    return () => {
      cancelled = true
      ctx.revert()
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
  }, [])

  return (
    <div ref={rootRef} className="relative min-h-[100dvh] overflow-x-hidden bg-canvas text-fg">
      {/* backdrop: CSS aurora fallback + lazy Three canvas fading in over it + vignette */}
      <div className="landing-aurora pointer-events-none fixed inset-0 z-0" aria-hidden />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 h-full w-full"
        style={{ opacity: sceneOn ? 1 : 0, transition: 'opacity 1200ms ease' }}
      />
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{ background: 'radial-gradient(125% 85% at 50% -10%, transparent 45%, rgba(10,10,11,0.72) 100%)' }}
        aria-hidden
      />

      {/* nav */}
      <nav className="relative z-20 mx-auto flex max-w-6xl items-center gap-3 px-6 py-5">
        <span className="h-3 w-3 rounded-sm bg-accent" aria-hidden />
        <span className="font-display text-base font-semibold tracking-tight">Halcyon</span>
        <div className="flex-1" />
        <button
          onClick={onEnter}
          className="rounded-md border border-hairline-strong px-3.5 py-1.5 text-xs text-fg-dim transition-colors hover:border-accent hover:text-fg"
        >
          Open the editor
        </button>
      </nav>

      <main className="relative z-10">
        {/* hero — split: copy + live before/after */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-24 pt-10 md:min-h-[82vh] md:grid-cols-[1.05fr_1fr] md:gap-16 md:pt-16">
          <div>
            <p className="hero-line mb-5 text-xs uppercase tracking-[0.32em] text-accent">
              Reference-match color
            </p>
            <h1 className="hero-line font-display text-5xl font-semibold leading-[1.02] tracking-tight text-balance md:text-6xl lg:text-7xl">
              Match the look of any photograph.
            </h1>
            <p className="hero-line mt-6 max-w-md text-lg leading-relaxed text-fg-muted">
              Drop in a reference. Halcyon reads its color and tone, then writes them into real,
              editable controls.
            </p>
            <div className="hero-line mt-9 flex flex-wrap items-center gap-3">
              <button
                onClick={onEnter}
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-[#0E0E0F] transition-[filter] hover:brightness-110"
              >
                Open Halcyon
              </button>
              <a
                href="#match"
                className="rounded-lg border border-hairline-strong px-5 py-2.5 text-sm text-fg-dim transition-colors hover:border-accent hover:text-fg"
              >
                See the match
              </a>
            </div>
          </div>
          <div className="hero-line">
            <BeforeAfter seed="halcyon-hero-canyon" eager />
            <p className="mt-3 text-center text-xs text-fg-faint">Drag to compare</p>
          </div>
        </section>

        {/* the match writes into real controls */}
        <section id="match" className="mx-auto max-w-6xl px-6 py-28">
          <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
            <div className="match-panel reveal order-2 flex flex-col gap-4 rounded-2xl border border-hairline bg-panel/70 p-7 backdrop-blur-sm md:order-1">
              <div className="mb-1 text-[11px] uppercase tracking-wider text-fg-muted">
                Matched from reference
              </div>
              <MatchRow label="Exposure" value="+0.45" fill={64} />
              <MatchRow label="Contrast" value="+22" fill={72} />
              <MatchRow label="Highlights" value="-18" fill={36} />
              <MatchRow label="Temp" value="+6" fill={58} />
              <MatchRow label="Tint" value="-3" fill={47} />
              <MatchRow label="Saturation" value="+9" fill={61} />
            </div>
            <div className="order-1 md:order-2">
              <h2 className="reveal font-display text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl">
                Not a filter. A foundation.
              </h2>
              <p className="reveal mt-5 max-w-md text-base leading-relaxed text-fg-muted">
                The match lands as exposure, contrast, white balance, and curves. Sliders you keep
                shaping. Nothing baked, nothing hidden. You always see exactly what it did.
              </p>
            </div>
          </div>
        </section>

        {/* batch + drifting frames */}
        <section className="mx-auto max-w-6xl px-6 pt-20">
          <h2 className="reveal font-display text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl">
            One look. Two hundred frames.
          </h2>
          <p className="reveal mt-5 max-w-xl text-base leading-relaxed text-fg-muted">
            Set the look once. Halcyon normalizes every frame to its own light, so the bright ones
            never blow out and the dark ones never crush. A whole shoot, one mood.
          </p>
        </section>
        <div className="reveal mt-12">
          <FilmMarquee />
        </div>

        {/* philosophy — full-bleed photo, dimmed, big statement over it */}
        <section className="relative mt-20 overflow-hidden">
          <img
            src={img('halcyon-studio-wide', 1920, 900)}
            alt=""
            aria-hidden
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover opacity-25"
            style={{ filter: AFTER }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-canvas via-canvas/60 to-canvas" aria-hidden />
          <div className="relative mx-auto max-w-5xl px-6 py-36">
            <h2 className="reveal max-w-3xl font-display text-4xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Your photo is the only color in the room.
            </h2>
            <p className="reveal mt-5 max-w-lg text-base leading-relaxed text-fg-muted">
              A neutral, dark, gold-touched interface that never argues with your image. The tool
              recedes. The photograph leads.
            </p>
          </div>
        </section>

        {/* final CTA */}
        <section className="mx-auto max-w-3xl px-6 py-32 text-center">
          <h2 className="reveal font-display text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
            Start editing.
          </h2>
          <p className="reveal mx-auto mt-5 max-w-md text-base leading-relaxed text-fg-muted">
            No account, nothing to install. Your photos never leave your browser.
          </p>
          <div className="reveal mt-9">
            <button
              onClick={onEnter}
              className="rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-[#0E0E0F] transition-[filter] hover:brightness-110"
            >
              Open Halcyon
            </button>
          </div>
          <p className="mt-20 text-xs text-fg-faint">Halcyon. Reference-match photo editing.</p>
        </section>
      </main>
    </div>
  )
}

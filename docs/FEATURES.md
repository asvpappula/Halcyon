# Halcyon — Features (by phase, MoSCoW)

Phase plan reflects the CEO scope-cut: wedge first (P1 engine + P2 hero), everything else deferred. Original 8-phase brief scope lives in [TODOS](../TODOS.md). MoSCoW: Must / Should / Could / Won't(this version).

## Phase 0 — Engine spike (gate before app code)
- **Must:** sRGB↔linear↔XYZ↔Lab + ΔE2000 (`color.ts`); analytic reference→control fit (`fit.ts`); Lab stats from proxy (`stats.ts`); the GLSL ops; **fidelity gate** (median ΔE2000 ≤ 3 on 15+ pairs); **equivalence gate** (shader ≈ forward-model). Both blocking. See [ARCHITECTURE §2.1, §10](ARCHITECTURE.md).

## Phase 1 — Foundation + engine core
- **Must:** Vite/React/TS/Tailwind scaffold with design tokens wired; WebGL2 fixed-order pipeline; import one JPEG/PNG/TIFF, display, zoom/pan; non-destructive ControlParams model; Exposure live + double-click reset; command-pattern undo/redo; local-first IndexedDB persist (restore on reload).
- **Should:** color-neutral dark shell per DESIGN-SYSTEM; designed empty/loading/error states for the canvas.

## Phase 2 — The hero (wedge MVP)
- **Must:** all core controls live (Exposure, Contrast, Highlights, Shadows, Whites, Blacks, Temp, Tint, Vibrance, Saturation, fitted Tone Curve); reference upload; **analytic match → writes fitted ControlParams** with the signature slider fill-in animation; **match-strength ring**; **per-image batch fit** (the normalization promise) via Web Worker pool with real progress; **mood-board multi-reference (robust average only)**; basic crop + aspect presets; export (JPEG/PNG, quality, resize, social sizes); the **free no-login tool = landing/funnel**; **shareable look link**.
- **Should:** before/after (spacebar + split handle); contextual 3-beat onboarding; batch grouped-undo.
- **Could (→ TODOS):** save/reuse a look; full batch "needs attention" flags; recipe/JSON export.

## Deferred — Won't (this version) — see TODOS.md
Full HSL/color mixer, color grading wheels, detail (sharpen/NR), vignette/grain, perspective/geometry, manual point-curve + per-channel RGB curves, presets, .cube LUT import, library/collections/ratings/flags, auth/accounts/Supabase/RLS, cinematic GSAP/Three.js landing, TIFF/WebP/watermark export, RAW decode, AI masking, wedding-photographer expansion.

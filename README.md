# Halcyon

A non-destructive, Lightroom-style color & tone editor for the browser. Its
standout features are **reference-look matching** (drop a reference image, get an
editable look written into real sliders — not a locked filter) and **smart batch
processing** (normalize a whole shoot to one target look).

Everything runs client-side: a WebGL2 render pipeline for develop, Web Workers
for batch, IndexedDB for local-first persistence. No upload required to edit.

## Features

- **Reference match** — fit a reference image's color statistics onto editable
  develop sliders, with a "match strength" readout so you can see how close the fit is.
- **Smart batch** — apply the matched look across selected photos, normalizing
  *each* image to the same target (not value-copying), so different exposures converge.
- **Full develop toolkit** — exposure/contrast/highlights/shadows/whites/blacks,
  temp/tint/vibrance/saturation, an 8-band **HSL color mixer**, **Detail** (sharpen,
  noise reduction), **Effects** (vignette, grain), and an interactive **tone curve**
  (master + per-channel R/G/B).
- **Presets** — save/apply/delete looks, plus built-in starters.
- **Crop** with aspect presets, **shareable look links**, and **export** to JPEG/PNG/WebP.
- **Non-destructive** end to end — edits are values, never pixels — with full
  undo/redo and local persistence.

## Tech stack

Vite · React · TypeScript · Tailwind · WebGL2 · Zustand · Dexie (IndexedDB) ·
Vitest. Deploys to Netlify.

## Getting started

```bash
npm install
npm run dev        # dev server at http://localhost:5173
npm run build      # production build -> dist/
npm run test       # unit tests (engine: color, fit, curve)
npm run typecheck  # tsc --noEmit
```

## Architecture notes

- **Single source of truth for the math.** The fit-relevant develop ops live in
  both `src/engine/ops.ts` (CPU forward model the match fit uses) and
  `src/engine/shaders.ts` (GLSL). `src/engine/equivalence.ts` is a dev-time gate
  that renders test colors through both and asserts they agree within ΔE — so a
  fitted slider stack reproduces the look faithfully. It logs
  `equivalence PASS · median ΔE …` to the console in dev.
- **Render-only stages.** HSL, Detail & Effects, and the tone curve live only in
  the shader (the match never produces them — they're user tuning). Each is gated
  to be exact identity at its default so the equivalence gate stays valid.
- **Fixed-order, scene-referred pipeline** (darktable-style): white balance →
  exposure → contrast → tone regions → saturation/vibrance → HSL → detail/effects →
  tone curve, tone-mapped to sRGB last.

See `docs/` for the full PRD, architecture, engine spec, and design system.

## Status

The reference-match wedge and the full develop toolkit are built and verified.
Deferred items (library/collections, `.cube` LUT import, auth/sync, RAW decode,
AI masking, worker offload for very large batches) are tracked in `TODOS.md`.

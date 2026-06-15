# Halcyon — Architecture (ARCHITECTURE.md)

Locked by /plan-eng-review on 2026-06-14 (HOLD SCOPE). Scope = the wedge (P1 engine + P2 hero). Stack: Vite + React + TypeScript + Tailwind + WebGL2 + Zustand, local-first (IndexedDB), Netlify. Greenfield.

## 0. Module layout
```
src/
  engine/        # pure, framework-free: no React, no DOM beyond canvas
    color.ts        # sRGB<->linear<->XYZ<->Lab, ΔE2000
    pipeline.ts     # WebGL2 fixed-order render pipeline
    shaders/        # GLSL passes
    fit.ts          # analytic reference->control fit (the IP)
    normalize.ts    # per-image target-fit (see §2)
    stats.ts        # Lab mean/std/percentile from a proxy
    types.ts        # ControlParams, LabStats, Command
  store/          # Zustand: edits, history, selection, reference
  workers/        # batch fit + offscreen render/export pool
  persist/        # IndexedDB (Dexie-thin) + Supabase sync seam (deferred)
  ui/             # React: editor, tool/funnel, panels, sliders, trays
  app/            # routing, providers
```
`engine/` has zero UI deps so it is unit-testable headless and reusable in workers.

## 1. WebGL render pipeline (fixed order, scene-referred linear)
Non-destructive: we store **ControlParams (values), never pixels.** Each render runs the full fixed-order chain from the source texture. Order is fixed (darktable model) so toggling/retuning any control is order-independent.

```
 source bytes
   │  [INSERTION POINT A: RAW decode -> linear RGB]  (deferred, slots here)
   ▼
 (1) decode JPEG/PNG/TIFF -> RGBA8 tex   (EXIF orientation applied on import)
 (2) input transform: sRGB -> LINEAR RGB  (working space = linear)
   ▼  ── all ops below operate in linear light ──
 (3) White balance      (Temp, Tint)
 (4) Exposure           (linear multiply)        ← per-image fitted value carries normalization (§2)
 (5) Tone regions       (Contrast, Highlights, Shadows, Whites, Blacks)
 (6) Tone curve         (fitted points)
 (7) Color              (Vibrance, Saturation)
   │  [INSERTION POINT B: mask compositing — gate ops 3-7 by a mask]  (deferred)
 (8) Crop / geometry    (sampling region)
 (9) OUTPUT transform: LINEAR -> display sRGB   (tone-map / encode LAST)
   ▼
 canvas (preview)   ·or·   offscreen full-res -> encode (export)
```
- One fragment program runs ops 3-7 in a single pass (uniforms = ControlParams) to avoid texture round-trips; geometry/crop is a sampling transform; output encode is the final step. No intermediate GPU→CPU readback anywhere in interactive or fit paths.
- Preview renders at the zoom/viewport resolution from a proxy texture; **full resolution is touched only on export.**

## 2. The match-fit engine (the IP) + normalization
`fit.ts` turns a reference's color statistics into editable ControlParams. **No GPU readback** — it fits against an *analytic forward model* of ops 3-7.

```
reference image(s) ──▶ stats.ts (Lab mean/std/percentiles from a 256px proxy)
                          │  (mood-board: robust AVERAGE of N refs — trimmed mean/median per channel; NO clustering)
                          ▼
                     TARGET stats (μ,σ per L,a,b)
 target stats + per-image SOURCE stats ──▶ fit.ts (closed-form, color-homography framing)
   fit order: WB (chroma) → Exposure/Contrast/Whites/Blacks (shading/L affine) → Tone curve (residual L shape) → Saturation (chroma spread)
   with light regularization so L-controls and curve don't trade off degenerately
                          ▼
                  ControlParams  (drops onto real sliders; render = §1)
   match strength = 100 × (1 − normalized residual ΔE), surfaced as the ring readout
```
**Per-image normalization = per-image re-fit.** "Apply look to a batch" does NOT copy slider values across images. It fits *each* image independently to the *shared TARGET stats* from that image's own SOURCE stats. Concretely, the fit minimizes ΔE to the **same** target μ,σ (L,a,b) for every image; there is no separate "normalize to an anchor, then apply the look" step (that earlier framing in the design/research docs is superseded — it would be a second L transform). One fitted transform per image, full stop. Bright and dark frames get different Exposure/tone values that all land at the same look. This is why nothing blows out and why there is nothing to double-count.
Spike gate (build step 0): median ΔE2000 (fitted-render vs ideal Lab transfer) ≤ 3 on 15+ pairs. Guards: σ→0 (flat reference) clamps + low-confidence flag.

### 2.1 Forward model ↔ shader equivalence (the #1 technical risk)
`fit.ts`'s analytic forward model and the GLSL shader (§1, ops 3-7) implement the same math twice. If they drift by even a constant, fitted sliders reproduce a *different* look than the fit targeted, and the match-strength readout becomes a lie — this silently breaks the hero. Mechanism to prevent it:
- **Single source of truth:** each op (WB, Exposure, Contrast, Highlights/Shadows/Whites/Blacks, Tone curve, Saturation) is defined once as a documented closed form. Both the GLSL and the TS forward model are written from that one spec, never invented separately. Same constants, same order.
- **Equivalence gate (step 0, CI, BLOCKING):** for random ControlParams, render via the *real* shader, do a one-time **test-only** readback, convert to Lab, and assert `ΔE2000(shaderRender, forwardModel(params)) ≤ ε`. Readback is forbidden in app paths but allowed in this test. This runs alongside the fidelity gate: the fidelity spike proves fit≈ideal; this proves shader≈fit. Both must pass before P2 UI. Without this, the fidelity gate can pass while the shipped look is wrong.

## 3. State + non-destructive history (Zustand + command pattern)
```ts
type ControlParams = { exposure:number; contrast:number; highlights:number; shadows:number;
  whites:number; blacks:number; temp:number; tint:number; vibrance:number; saturation:number;
  toneCurve:Point[]; crop:CropRect|null };           // values only, never pixels
type Command = { photoId:string; before:Partial<ControlParams>; after:Partial<ControlParams>; label:string };
interface Store {
  photos: Record<string,PhotoMeta>;
  edits:  Record<string,ControlParams>;              // current params per photo
  history:Record<string,{stack:Command[]; cursor:number}>;  // per-photo undo/redo
  selection:string[]; activePhotoId:string|null;
  reference:{ refIds:string[]; target:LabStats }|null;
  /* actions: setControl(coalesced), applyMatch(group cmd), undo, redo, ... */
}
```
- **Scrubbing coalesces to ONE command** (captured on pointer-up: before=pre-drag, after=final), so undo steps are meaningful, not per-frame.
- **Batch apply = ONE grouped command** spanning the selection, so a single undo reverts the whole batch.
- Undo/redo = move `cursor`, apply before/after deltas. History is per-photo.
- **Tone-curve edits coalesce per gesture** (one command per point add/move/delete drag, captured on pointer-up). `applyMatch` writes the fitted curve as part of its grouped command; any in-progress manual curve edit is committed first, then the match applies on top — match never silently discards a user edit mid-drag.
- Persistence: a debounced (250ms) writer flushes `edits[id]` to IndexedDB on change.

## 4. Web Worker strategy (batch never freezes UI)
- Pool size = `max(1, hardwareConcurrency − 1)`.
- Main thread owns UI + the single interactive WebGL canvas.
- Batch: workers compute the per-image **fit** (cheap, analytic, CPU) and, where `OffscreenCanvas` + WebGL2 in workers is supported, also render/encode export; otherwise export renders queue on a main-thread offscreen canvas between frames. Caveat: OffscreenCanvas+WebGL2-in-worker support is uneven (Safari has lagged); on those engines the "never freezes" promise degrades to "stays responsive" (chunked main-thread offscreen renders between frames).
- Transfer images as `ImageBitmap` (transferable) — no structured-clone of big buffers. Progress = `postMessage` per completed image; UI shows a determinate bar ("12 / 40").
- Cancellation token so navigating away aborts the batch.

## 5. Persistence (IndexedDB now, Supabase seam later)
DB `halcyon` v1 (thin Dexie wrapper):
- `blobs` {id, bytes}            — original image bytes (local-first)
- `photos` {id, name, w, h, createdAt}
- `edits` {photoId, params, schemaVersion, updatedAt}
- `looks` {id, name, target, createdAt}   — saved looks (feature deferred; store seam exists)
- `meta` {key, value}            — appSchemaVersion
**IDs are UUIDs from day one** so a future Supabase sync needs no remap. `schemaVersion` on every edit row → `migrate()` runs on read for old rows. **Supabase sync seam:** edits/looks are plain JSON keyed by UUID; the deferred sync layer push/pulls these rows under a `user_id` with RLS. No app-code change to the engine when it lands.

## 6. Color management (v1)
Assume sRGB input. GPU: sRGB→linear (piecewise gamma) at step 2, all ops linear, linear→sRGB at step 9. Lab/ΔE math (stats, fit) computed CPU-side from linear→XYZ→Lab on the 256px proxy. Display-P3 / embedded ICC: converted to sRGB on import or ignored (flagged in UX); full color management deferred.

## 7. Test strategy
- **Unit (engine, headless):** color round-trips (sRGB↔linear↔XYZ↔Lab) within ε; `fit.ts` recovers known control values from synthetic transforms; mood-board trimmed-mean correctness; **normalization: two images of different exposure fit to the same target land within tolerance** (the core promise).
- **Golden-image:** fixed ControlParams → expected output (SSIM/hash vs committed reference PNG) so shader changes can't silently drift.
- **Fidelity harness (spike, also CI):** 15+ ref/target pairs, assert median ΔE2000 ≤ 3 (fit ≈ ideal).
- **Equivalence gate (§2.1, CI, BLOCKING):** `forwardModel(params) ≈ shader(params)` within ΔE ε — the test that stops fit/shader drift from silently breaking the hero.
- **Property:** random params never yield NaN / out-of-gamut overflow.
- **Worker/perf:** batch of N keeps main-thread frame time under budget; progress monotonic; cancellation works.

## 8. Performance plan
- Single multi-op fragment pass; reuse textures; **zero readback** in interactive + fit paths.
- Fit/stats run on a 256px proxy, not full res. Preview renders at viewport res. Full res only on export.
- **Fitted ControlParams are resolution-invariant by construction** (ops 3-7 are pointwise/parametric, not pixel-neighborhood ops), so params derived on the proxy apply unchanged at full res. The proxy is used ONLY to derive statistics, never pixel-space values.
- **Export encode (`convertToBlob`/`toBlob`), not render, is the batch bottleneck** at 40 × large images. Encode in workers where possible; stream and release each image's buffers as it finishes.
- Worker pool for batch; release `ImageBitmap`/textures after each export to bound memory.
- Large images (>~50MP): downscaled working proxy + warning; export streams per-image.
- Target: slider scrub at 60fps on a mid GPU; batch of 40 images stays responsive.

## 9. Edge cases / shadow paths
- Import: non-image → reject (error card); decode fail → skip + flag in filmstrip; >50MP → proxy + warn; HEIC/unsupported → "convert to JPEG/PNG/TIFF".
- Reference: flat/zero-variance → σ guard + low-confidence match; tiny ref → still stats from proxy.
- Batch: mixed sizes/orientation handled per-image; one failure continues the batch and flags that image; memory pressure → chunked processing.
- History: batch-apply is one grouped undo; reset (double-click) is its own command.
- Persistence: quota exceeded → warn + offer clear; no IndexedDB (private mode) → in-memory fallback + "edits won't persist" notice.

## 10. Build sequence
0. **Engine fidelity spike** (standalone, throwaway-ok): `color.ts` + `fit.ts` + `stats.ts` + the GLSL ops + ΔE harness on 15+ pairs. **TWO BLOCKING GATES before app code: (a) fidelity median ΔE2000 ≤ 3 (fit≈ideal); (b) forward-model↔shader equivalence (§2.1, shader≈fit).** Build the shader ops here too (not just the analytic model) so both gates are real at step 0.
1. **P1:** scaffold, WebGL2 pipeline (§1), single import + display + zoom/pan, ControlParams + Exposure live + double-click reset, command-pattern history, IndexedDB persist.
2. **P2:** all core controls live; match engine wired to write fitted params (with the signature slider animation); per-image batch fit + worker pool; mood-board average; crop/aspect + export; free no-login funnel shell; shareable look link.

## 11. Deferred insertion points (architected, not built)
- **RAW decode:** Insertion Point A — a decode stage producing linear RGB before step 2. Pipeline unchanged downstream.
- **Masks:** Insertion Point B — a gate texture multiplied into ops 3-7's effect. The fixed-order model already supports a per-op mask uniform.
- **Auth/sync:** §5 seam. **Advanced controls (HSL, color grading, detail, geometry, presets, LUT, library):** TODOS.md.

# Halcyon — Deferred Work (TODOS)

Deferred from the CEO review on 2026-06-14 (Selective Expansion). The MVP perimeter is the wedge (P1 engine + P2 hero, usable end-to-end). Everything below is **post-validation**: build only after the free funnel shows real pull from content-creator / mood-board users.

## Phase 2 — COMPLETE (wedge shipped)
All wedge features built, verified in-browser, and committed: reference-match (hero) + signature
animation, export (JPEG/PNG/WebP + resize), crop/aspect, per-image batch normalization, share link,
funnel landing, mood-board multi-reference. Commits: 2775469, 998f1f6, ff5e525, 788257d, 795983c, 9bc39e2.
Before "ship": end gates (a formal /review of the Phase 2 diff; /ship needs a GitHub remote).
Original per-feature build notes follow.

Built + verified + committed: the single-photo wedge end-to-end (import → reference-match → tune → export).
- Commits: `2775469` (P1 foundation + hero match), `998f1f6` (export).
- Layout: engine `src/engine/`, store `src/store/editor.ts`, UI `src/ui/`, export `src/engine/export.ts`.
- DEV QA hook: `window.__editor` (the store). Tests: `npm test` (13 green). Gates: fidelity (CI, `fit.test.ts`) + shader↔forward-model equivalence (in-browser badge, `equivalence.ts`), both green.
- Known: `ops.ts` and `shaders.ts` are the single source of truth pair — edit both together or the equivalence gate fails (by design).

Remaining Phase 2 (each ~hero-sized; resume in a fresh pass):
- [ ] **Crop / aspect** — add `crop: CropRect|null` to `ControlParams` (fit/ops ignore it); aspect presets (1:1, 4:5, 16:9, 3:2, Original) set a centered rect as one command; live overlay rect on the canvas (use the renderer's contain-fit rect at zoom 1); export honors crop by 2D-cropping the full render before resize/encode (no shader change).
- [x] **Batch-to-selection** — multi-select filmstrip + per-image normalization; the fit now runs in a **Web Worker** (`engine/match.worker.ts`) off the main thread (main extracts the cheap proxy, worker fits), determinate progress, one undo command per photo. (Single worker, not a pool — sufficient since the worker is the bottleneck, not parallelism.)
- [ ] **Funnel shell** — no-login route that *is* the tool (clean minimal shell; the cinematic GSAP/Three.js landing is its own later task, below).
- [ ] **Share link** — v1: encode the look (`ControlParams`) in a URL hash to pre-load + apply to your own photo. (True before/after image URL needs the deferred Supabase storage.)
- [ ] Then Phase 2 end gates: /review → /qa → /ship → land-and-deploy → canary.

## Cherry-picked but deferred (cheap, do soon after launch)
- [x] **Save / reuse a look** — presets persist to localStorage (`persist/presets.ts`) + 4 built-in Halcyon looks; save/apply/delete in the ReferenceTray. (Scalar develop values only; HSL/crop excluded for now.)
- [ ] **Full batch "needs attention" flags** — per-image flags in batch view when normalization/fit is weak. (Match-strength readout itself ships in P2; this is the richer flag UI.)
- [ ] **Recipe export** — export the fitted slider values as a shareable JSON/preset that also drops into Lightroom. Overlaps the preset/LUT work below; do them together.

## Develop toolkit (the Lightroom-clone bulk — build only when users ask)
- [x] HSL / Color Mixer (8 bands: hue/sat/lum) — render-only stage in the shader (`shaders.ts` §7), array uniforms, `HslMixer.tsx` UI, undoable per-band scrub. Verified: identity at 0, correct hue/sat/lum, per-band isolation, equivalence gate unaffected.
- [x] Color Grading — shadow/mid/highlight hue/sat wheels + per-region luminance + balance (`ui/ColorGrade.tsx`, render-only shader stage, region-isolated). Verified.
- [x] Presence — Texture, Clarity, Dehaze (local-contrast + veil, render-only). Verified on an edge texture.
- [x] White balance eyedropper — click a neutral; temp/tint solved exactly (`engine/wb.ts`).
- [x] Detail — Sharpening (amount + radius/detail/masking) + Noise Reduction (luminance + color NR). Verified.
- [x] Effects — Vignette (amount + midpoint/feather/roundness, round↔box) + Grain (amount + size/roughness). Verified.
- [x] Geometry — straighten + perspective H/V (shader UV transform, display + export). **Rotate-90 deferred** (needs frame-aspect swap through fit/crop/overlay/export + visual iteration).
- [x] Manual tone-curve point editing + per-channel RGB curves — monotone-cubic curve math (`engine/curve.ts`, 7 tests) baked into a 256-LUT sampled in `shaders.ts` §9 (gated identity), interactive `CurveEditor.tsx` (drag/add/remove, master+R/G/B), undoable. Verified: S-curve + per-channel isolation through the shader.

## Library + organization
- [x] Collections (create/rename/delete/assign) — chips in the filmstrip bar; double-click to rename, "Add to collection" for the selection. Persisted in localStorage.
- [x] Star ratings (1–5) + flags (pick/reject/unflagged) — in-filmstrip stars + flag toggle; keyboard 1–5 (toggle), P/X/U (input-guarded). Persisted.
- [x] Filter by rating/flag, sort by date(added)/name/rating — library bar selects drive a derived visible set; batch ops act on the visible/selected set. (`persist/library.ts`, `ui/Filmstrip.tsx`)

## Presets + LUTs
- [x] User presets (save/apply/delete) + built-in starter looks — `persist/presets.ts` + ReferenceTray (inline name input).
- [x] .cube LUT import as a pipeline layer — `engine/lut.ts` parser (5 tests) → WebGL2 `sampler3D` volume on texture unit 2, sampled after the tone curve with trilinear interp + intensity blend (gated identity). Registry persisted to IndexedDB (Dexie v2); per-photo `lut` ref. `LutPanel.tsx` import/apply/delete + amount slider. Verified: exact invert through the shader, undoable apply/intensity.
- [x] Copy/paste develop settings across photos — clipboard copies the full look (all develop fields except crop, deep-cloned), Copy/Paste in the top bar + "Paste to N" in the batch footer; one undo command per paste. Verified incl. HSL/curve fields + clipboard independence.

## Launch prep
- [x] Netlify deploy config (`netlify.toml` + `public/_redirects`), README, pushed to GitHub (asvpappula/Halcyon).
- [x] Replace blocking `alert()`/`prompt()` with a toast system (`store/toast.ts` + `ui/Toaster.tsx`) and an inline preset-name input.
- [x] Before/after compare — hold the "Before" button or `\` to render the unedited original (serves the "I saw exactly what it did" north star).
- [ ] Connect repo to Netlify + first deploy (needs user action — accounts/credentials).
- [x] Large-image display proxy — the on-screen working texture is capped to min(MAX_TEXTURE_SIZE, 4096) with a high-quality downscale (export still full-res). Prevents huge-image upload failures + cuts GPU memory.
- [x] Keyboard shortcuts — ←/→ navigate photos; 1–5 rate; P/X/U flag; `\` compare; Ctrl/Cmd+Z/Y undo/redo; 0 reset view (all input-guarded).
- [x] Accessibility pass — canvas role/label (reflects compare), labelled panels (Develop / Reference), aria-labels on icon buttons, focus-visible rings, dialog/toast roles.

## Accounts + backend (only when persistence/teams are demanded)
- [ ] Supabase Auth (email + one OAuth) + Postgres + Storage
- [ ] RLS on every table; anon key only in client; service-role server-side only
- [ ] Sync the local-first IndexedDB edit JSON to Supabase
- [ ] Versioned SQL migrations

## Marketing surface
- [ ] Cinematic GSAP/Three.js landing (lazy-load after LCP, CSS fallback). Ships only once there's a validated product to market; the working tool is the demo until then.

## Export polish
- [x] TIFF (hand-rolled encoder `engine/tiff.ts`) + WebP + text watermark (position/opacity) + batch export (zip via fflate). Verified. (Image-watermark + advanced resize deferred.)

## Phase 1 review fast-follows (from staff-eng review)
- [x] Large-image proxy: working texture downscaled to min(MAX_TEXTURE_SIZE, 4096); fit/stats already run on a 256px proxy (`proxyPixels`). (Worker-offload for very large batches still pending.)
- [ ] Context-loss: basic rebuild-on-restore is in; add a real device test on low-memory mobile.
- [ ] Orphan edits: `loadAll` drops edits whose blob is missing — fine for now; add a cleanup sweep when library lands.

## Engine / quality (track as it matures)
- [ ] If fidelity spike median ΔE2000 > ~3: add bounded CPU refinement to the analytic fit (CEO D1 option C).
- [ ] Mood-board **clustering** (dominant-look target) — deferred; P2 ships robust **averaging** only. Add clustering post-validation if averaging looks washed out.
- [ ] RAW decode pre-processing step (reserved insertion point; major project, post-v1).
- [ ] Mask-layer compositing (reserved insertion point; needs segmentation, post-v1).

# Halcyon — Deferred Work (TODOS)

Deferred from the CEO review on 2026-06-14 (Selective Expansion). The MVP perimeter is the wedge (P1 engine + P2 hero, usable end-to-end). Everything below is **post-validation**: build only after the free funnel shows real pull from content-creator / mood-board users.

## Cherry-picked but deferred (cheap, do soon after launch)
- [ ] **Save / reuse a look** — persist a created look (anon localStorage first), reapply across shoots. Retention win for repeat brand work.
- [ ] **Full batch "needs attention" flags** — per-image flags in batch view when normalization/fit is weak. (Match-strength readout itself ships in P2; this is the richer flag UI.)
- [ ] **Recipe export** — export the fitted slider values as a shareable JSON/preset that also drops into Lightroom. Overlaps the preset/LUT work below; do them together.

## Develop toolkit (the Lightroom-clone bulk — build only when users ask)
- [ ] HSL / Color Mixer (8 bands: hue/sat/lum)
- [ ] Color Grading (shadow/mid/highlight wheels + luminance)
- [ ] Detail — Sharpening (amount/radius/detail/masking) + Noise Reduction (luminance/color)
- [ ] Effects — Vignette + Grain
- [ ] Geometry — perspective correction, straighten, rotate (basic crop ships in P2)
- [ ] Manual tone-curve point editing + per-channel RGB curves (the *fitted* curve ships in P2)

## Library + organization
- [ ] Collections (create/rename/delete/assign)
- [ ] Star ratings (1–5) + flags (pick/reject/unflagged)
- [ ] Filter by rating/flag, sort by date/name/rating

## Presets + LUTs
- [ ] User presets (save/apply/delete) + built-in starter looks
- [ ] .cube LUT import as a pipeline layer
- [ ] Copy/paste develop settings across photos

## Accounts + backend (only when persistence/teams are demanded)
- [ ] Supabase Auth (email + one OAuth) + Postgres + Storage
- [ ] RLS on every table; anon key only in client; service-role server-side only
- [ ] Sync the local-first IndexedDB edit JSON to Supabase
- [ ] Versioned SQL migrations

## Marketing surface
- [ ] Cinematic GSAP/Three.js landing (lazy-load after LCP, CSS fallback). Ships only once there's a validated product to market; the working tool is the demo until then.

## Export polish
- [ ] TIFF + WebP, watermark (text/image), advanced resize

## Engine / quality (track as it matures)
- [ ] If fidelity spike median ΔE2000 > ~3: add bounded CPU refinement to the analytic fit (CEO D1 option C).
- [ ] Mood-board **clustering** (dominant-look target) — deferred; P2 ships robust **averaging** only. Add clustering post-validation if averaging looks washed out.
- [ ] RAW decode pre-processing step (reserved insertion point; major project, post-v1).
- [ ] Mask-layer compositing (reserved insertion point; needs segmentation, post-v1).

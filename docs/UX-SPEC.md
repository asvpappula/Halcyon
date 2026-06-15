# Halcyon — UX Spec

Flows and states for the wedge surfaces. Visual system: [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md). Includes a light design-review (dimension ratings + AI-slop check) folded in per the Phase 0 plan. North star: *"I saw exactly what it did."*

## Surfaces
1. **Free tool / funnel** (no login) — the landing page IS a working reference-match tool. One-screen dropzone → match → tune → export. Anonymous, capped (export watermark or batch ~5, exact gate TBD).
2. **Develop editor** — top bar (logo · Tool|Develop · B/A · Export), mood-board tray (left), canvas (center), develop panel (right), batch filmstrip (bottom). See DESIGN-SYSTEM §3 and the approved interactive mockup.
3. **Batch view + export** — filmstrip selection, batch apply, real progress, export with format/quality/resize/social presets.

## Key flows
- **First visit (activation):** land on the tool → dropzone "Drop a reference look, then your photos" → drop reference(s) + batch → **Apply match** → the signature slider fill-in plays (the north-star moment) → tune any slider → export. Target: under ~2 min, no login.
- **Onboarding (contextual, NOT a modal wall):** 3 coachmarks tied to real UI, dismissible, remembered in localStorage — (1) "Drop a reference look" → tray; (2) during the match fill-in → "Watch — the look just became real adjustments"; (3) "Tune anything, then export." (DESIGN-SYSTEM §8.)
- **Mood board:** add N references to the tray → blended-target swatch updates → match uses the robust average.
- **Batch apply:** select photos in the filmstrip → Apply match → per-image fit runs in workers with a determinate bar ("12 / 40") → each lands at the same look, normalized. One grouped undo.
- **Before/after:** hold `Space` (instant swap) or drag the split handle.
- **Shareable look link:** export a public before/after URL of a created look (funnel growth).

## States (every surface)
- **Empty:** tool first load = centered dropzone + ghosted before/after example; editor with no photo = same.
- **Loading:** neutral skeleton (no colored shimmer); batch = determinate per-image bar.
- **Error (inline, never modal):** decode fail → "Couldn't read that file. Supported: JPEG, PNG, TIFF" + Retry; match fail → "Match couldn't run — try a different reference," photo untouched (non-destructive); quota/no-IndexedDB → "edits won't persist" notice.
- **Onboarding:** the 3 coachmarks above.

## Interaction + accessibility (from DESIGN-SYSTEM §5, §9)
Sliders: thin track, gold fill only while live, tabular readout, drag track/thumb/number, double-click reset, arrow-key nudge (Shift ×10). Keyboard: Tab order, `[`/`]` prev/next image, `Space` before/after, `Esc` closes overlays. Focus rings always visible. `prefers-reduced-motion` snaps the signature animation. Hit areas ≥ 24px.

## Light design-review (dimensions 0-10 against the approved mockup)
- **Hierarchy (9):** the photo dominates; chrome recedes; one primary action (Export) + one signature action (Apply match). A 10 = zero element competes with the image.
- **Restraint / subtraction (9):** color-neutral grayscale chrome, gold only as a state signal. 10 = nothing on screen that doesn't earn its pixels.
- **Motion (9):** 120-160ms everywhere; the one earned exception is the match fill-in. 10 = every transition feels instant except the deliberate signature beat.
- **Trust (10):** render = slider stack, no hidden layer, residual shown honestly as match strength. This is the design's whole point.
- **Typography (8):** tabular numerals enforced so values don't jitter; finalize the display face for the funnel. 10 = readouts rock-steady while scrubbing, marketing type feels editorial.

## AI-slop check (PASS)
No blue-tinted darks. No purple gradients. No glassmorphism over the photo. No neon, no full-width gold, no bounce, no centered-everything template, no decorative blobs or 3-column icon grids. The working tool is the hero, not generated 3D. (DESIGN-SYSTEM §10.)

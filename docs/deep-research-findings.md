# HALCYON — Deep Research Findings (Phase 0, Step 2)

Date: 2026-06-14
Method note: The background multi-agent workflow stalled (no synthesized output, not stoppable via the task API), so this was produced via targeted inline web searches + domain knowledge, with confidence tags on the load-bearing claims. Treat HIGH as well-sourced, MED as reasonable-but-verify, LOW as assumption-to-test. Feeds ENGINE-SPEC.md, ARCHITECTURE.md, UX-SPEC.md, and corrections to the approved design doc.

---

## TL;DR — what changed
1. **A locked premise is now wrong.** Capture One's **Match Look** already decomposes a reference image's look into the editable RAW-developer sliders. So Halcyon is **not** "the only tool that turns a reference match into editable sliders." The honest, still-defensible wedge is narrower: *browser-based + no-login/free + no-catalog/ad-hoc + per-image **batch** normalization, for the content-creator buyer C1 doesn't court.* (See Area 4; design doc Premise 5 updated.)
2. **The interpretable decomposition is unpublished — it's our IP, and the real risk.** Reinhard color transfer (Lab mean/std) is well-documented, but mapping it onto Lightroom-style editable controls is **not** a solved/published recipe. Good news: the **color-homography** reframing (shading × chromaticity) is the math bridge toward exposure/white-balance-like parameters. (Area 2.)
3. **Reinhard's #1 failure mode validates per-image normalization.** Global-statistics dependence means a dominant region (big sky, white dress) skews the mean. Fix with **robust statistics** (median/percentile, outlier clipping) and per-image normalization — exactly our differentiator. (Area 2.)
4. **darktable's pixelpipe is the architecture to copy.** Fixed-order module pipeline, params editable at any time, scene-referred linear RGB, tone-map last. Clean insertion points for future RAW decode (bottom) and masks (module). (Area 3.)

---

## Area 1 — Lightroom Library + Develop (control reference)

Standard Develop control ranges (HIGH confidence — long-established; Halcyon edits JPEG/PNG/TIFF, so white balance behaves like LR's **non-raw relative** model, not absolute Kelvin):

| Control | Range | Default |
|---|---|---|
| Exposure | −5.00 … +5.00 EV | 0 |
| Contrast, Highlights, Shadows, Whites, Blacks | −100 … +100 | 0 |
| Temp / Tint (non-raw) | −100 … +100 (relative) | 0 |
| Texture, Clarity, Dehaze | −100 … +100 | 0 |
| Vibrance, Saturation | −100 … +100 | 0 |
| HSL (Hue/Sat/Lum × 8 bands) | −100 … +100 | 0 |
| Tone Curve regions (Hi/Lights/Darks/Shadows) + per-channel R/G/B | −100 … +100 / point curve | linear |
| Color Grading wheels | Hue 0–360, Sat 0–100, + Luminance per range | 0 |
| Sharpening | Amount 0–150, Radius 0.5–3.0, Detail 0–100, Masking 0–100 | 40/1.0/25/0 |
| Noise Reduction | Luminance 0–100, Color 0–100 | 0/25 |
| Vignette | Amount −100…+100 (+ Midpoint/Roundness/Feather) | 0 |
| Grain | Amount/Size/Roughness | 0 |

Sources: [Adobe — image tone & color](https://helpx.adobe.com/lightroom-classic/help/image-tone-color.html), [Julieanne Kost — Basic panel](https://jkost.com/blog/2024/08/using-the-basic-panel-and-histogram-to-exposure-and-contrast-in-lightroom-classic.html), [Jos Buurmans — tone controls](https://www.josbuurmans.nz/peaklight/master-lightroom-tone-controls).

**Good to copy:** Basic panel grouping (Light → Color → Presence); Reference View (side-by-side); non-destructive history; ranges normalized to ±100 (predictable for a fit solver). **Clunky / improve:** modal panels, slow large-image redraws, history is linear-only, WB eyedropper precision. **Library:** collections, 1–5 stars, pick/reject/unflag flags, filter/sort by rating/flag/date — table-stakes, copy directly.

**Engine implication:** the match fit targets a *subset* in P2 (Temp, Tint, Exposure, Contrast, Whites, Blacks, Saturation, fitted Tone Curve), all on the ±100 / EV scales above, so the solver output drops straight onto real sliders.

---

## Area 2 — Lab-space color transfer → editable controls (the load-bearing risk)

**Reinhard (2001) — the baseline (HIGH):** convert to decorrelated **lαβ** space, then per-channel affine: `out = (in − μ_src)·(σ_ref/σ_src) + μ_ref`. Simple, fast, the canonical reference-look transfer.

**Documented limitations (HIGH) — each maps to a design decision:**
- **Global-statistics dependence:** a large uniform region (sky, white dress) dominates the mean and skews the transfer → **use robust stats (median + percentile clipping), not raw mean/std.**
- **Affine-only:** can't represent non-linear look shifts → this is exactly why the residual exists and why HSL/curve in P3 shrink it.
- **Degenerate σ→0** ("pure color" reference) → guard the divisor; clamp.
- **Pair sensitivity / complex scenes** (Reinhard himself masked sky separately) → seeds future per-region matching (deferred, but architect for it).

**The interpretable-fit question — VERDICT: this is novel work, not a library call (MED→HIGH).** Searches confirm the literature covers transfer→pixels and transfer→LUT, but **not** a published "Reinhard → Lightroom sliders" decomposition. So our analytic-forward-model + least-squares fit is genuine IP and the real engineering risk. The strongest theoretical bridge is **color homography** ([Gong et al., arXiv:1608.01505](https://arxiv.org/pdf/1608.01505)), which recodes color transfer as **shading (exposure-like) × chromaticity (white-balance-like)** factors — far more naturally invertible onto Exposure + Temp/Tint than a raw Lab affine. **Recommendation for ENGINE-SPEC:** fit in this order — (1) chromaticity/WB → Temp+Tint, (2) shading/luminance affine → Exposure+Contrast+Whites+Blacks, (3) residual luminance shape → fitted Tone Curve, (4) chroma spread → Saturation. Regularize so (2) and (3) don't fight.

**Fidelity expectation (MED):** an affine/homography fit onto this basis gets most pairs to a good visual starting point, but pairs with large **independent** σa vs σb (chroma stretched on one axis only) provably can't be matched by a single Saturation control — those carry visible residual the user closes via HSL in P3. Keep the ΔE2000 bar as **median ≤ 3 across a test set**, not a per-pair guarantee.

Sources: [Reinhard paper reading](https://hypjudy.github.io/2017/03/19/paperreading-color-transfer/), [PyImageSearch — fast color transfer](https://pyimagesearch.com/2014/06/30/super-fast-color-transfer-images/), [Brown CSCI1290 color transfer lab](https://browncsci1290.github.io/labs/colortransfer/index.html), [Color transfer/style overview, arXiv:2204.13339](https://arxiv.org/pdf/2204.13339), [Color homography, arXiv:1608.01505](https://arxiv.org/pdf/1608.01505).

---

## Area 3 — Non-destructive editing architecture

**Adopt darktable's pixelpipe model (HIGH):** image processing is a chain of parameterized **modules in a fixed order**; you can toggle/retune any module at any time and the result is order-independent of *when* you touched it; processing runs through a **scene-referred linear RGB** working space with tone compression applied **last**. This is precisely Halcyon's WebGL op chain: a fixed-order list of parameterized passes, edits stored as **parameters not pixels**, working in linear light, output transform at the end.

- **Undo/redo:** the equivalent of darktable's **history stack** = command pattern; each edit is a reversible parameter delta. Architect this in P1 (the brief demands it), not bolted on.
- **Persistence:** desktop tools split between sidecar (Lightroom **XMP**, darktable **.xmp**) and DB (LR catalog). Halcyon: **local-first IndexedDB** storing the parameter set per image, schema-versioned, then sync the same JSON to Supabase when auth lands (P5+).
- **Insertion points (deferred but architected):** RAW decode slots at the **bottom** of the pipe (before linearization); mask compositing slots as a **module** that gates a downstream op's effect. Both fit the fixed-order model with no rewrite.

Sources: [darktable — darkroom concepts](https://darktable.gitlab.io/doc/en/darkroom_concepts.html), [darktable — pixelpipe & module order](https://docs.darktable.org/usermanual/4.8/en/darkroom/pixelpipe/the-pixelpipe-and-module-order/).

---

## Area 4 — Polish bar + competitor map

**Premium UI patterns (MED, consistent across sources):** color-neutral dark chrome so the UI never biases color perception; thin sliders with drag-scrub, double-click-to-reset, and tabular-numeral readouts that don't jitter; hold-to-compare before/after; responsive large-image redraw. These match the brief's design tokens.

**Competitor map (HIGH on existence/format, MED on exact mechanics):**

| Tool | What it does | Output format | Reaches our buyer? |
|---|---|---|---|
| **Capture One Match Look** | Drag any image → applies its grade/exposure **to the editable RAW-dev sliders** | **Editable sliders** (in-app) | No — desktop, ~$18–48/mo, RAW/pro, **single-image** |
| Adobe Lightroom | Reference *View* only (manual eyeball); no native auto-match | n/a | No |
| Polarr AI Color Match | Reference look transfer (free, browser) | Download, or **baked** LR Profile / LUT | Partially, but baked not editable |
| color.io / Evoto / CapCut | One-click reference color match | Baked result / LUT | Partially, baked |
| Imagen / Aftershoot | Style learned from **your catalog** | Editable LR edits | **No — needs a catalog** |

Sources: [Capture One Match Look / review](https://www.newsshooter.com/2026/06/01/capture-one-raises-prices-again-is-it-still-worth-it-or-time-to-jump-ship/), [C1 pricing 2026](https://petapixel.com/2026/05/27/capture-one-to-increase-all-product-prices-by-6/), [Polarr AI Color Match](https://colormatch.polarr.com/), [Polarr guide](https://medium.com/@queenadaily/polarr-ai-color-match-a-comprehensive-guide-to-the-free-ai-powered-color-grading-tool-e13bf48d287f), [Adobe Match Look feature request](https://community.adobe.com/feature-requests-676/p-match-look-feature-666037).

**The exact gap Halcyon exploits (corrected and sharpened):** C1 proves reference-match-to-editable-sliders is *desirable and feasible* — but it's desktop, $18–48/mo, RAW/pro-focused, and single-image. Polarr/color.io/Evoto give baked LUTs/profiles. Imagen/Aftershoot need a catalog. **Nobody offers the free, browser, no-login, no-catalog, per-image-**batch**-normalized, editable-slider version aimed at content creators matching a mood board across 200 photos.** The moat is **batch + normalization + free browser + no-catalog beachhead**, not the slider idea itself.

---

## Carry into ENGINE-SPEC + design doc
- Fit order: WB → luminance affine → tone curve residual → saturation, via color-homography framing + analytic forward model + least squares; regularized.
- Robust statistics (median/percentile + clipping), not raw mean/std; guard σ→0.
- Per-image L normalization to a shared anchor before the look (the documented Reinhard weakness is our feature).
- Control ranges per Area 1 table; P2 fit targets the subset.
- Architecture: darktable-style fixed-order parameterized pipeline, command-pattern history, local-first IndexedDB JSON, RAW/mask insertion points reserved.
- Differentiation corrected: see Area 4. **Update Premise 5.**

## Open risks (route to ENGINE-SPEC prototype before P2 code)
- Interpretable fit fidelity is unproven on real pairs (no published recipe) — build a spike that measures median ΔE2000 on 15+ reference/target pairs before committing the P2 UI.
- C1 could add batch Match Look; speed to the content-creator beachhead matters.
- Per-image normalization vs the look's own L-shift must compose without double-counting (already specified in design doc).

# Halcyon — Engine Spec

The develop pipeline and the reference-match math. This is the **single source of truth** for the op definitions referenced by [ARCHITECTURE §2.1](ARCHITECTURE.md): the GLSL shader and the `fit.ts` analytic forward model are BOTH written from the closed forms below, never invented separately, and a blocking CI test asserts they agree (ΔE ≤ ε).

## Color space
- Input assumed sRGB. EXIF orientation applied on import. Display-P3/ICC → converted to sRGB or flagged (v1).
- Working space = **linear RGB** (sRGB primaries, linearized via the standard piecewise EOTF).
- Stats + fit math use **CIELAB** (D65) via linear-RGB → XYZ → Lab. Distance = **ΔE2000**.
- Output transform (encode to display sRGB) is the LAST pipeline step.

## Op definitions (fixed order; all in linear RGB unless noted)
Ranges are the UI ranges from DESIGN-SYSTEM/the brief; 0 = identity. These are spec-level closed forms (exact constants finalized in the spike, then frozen as the shared source of truth).

1. **White balance (Temp, Tint)** — chromatic adaptation in linear RGB. Temp shifts along the blue↔yellow axis, Tint along green↔magenta, applied as per-channel gains derived from a Bradford-style adaptation toward the target white. (−100..+100 each.)
2. **Exposure** — linear gain `rgb *= 2^(EV)`, where the UI value maps to EV (the per-image fitted value carries the normalization offset, §Fit). (−100..+100 mapped to a bounded EV range.)
3. **Contrast** — pivot S-curve around mid-gray in linear (or a perceptual pivot), strength from the slider. (−100..+100.)
4. **Highlights / Shadows / Whites / Blacks** — parametric tone-region roll-offs: Highlights/Shadows compress/lift the upper/lower mids; Whites/Blacks set the end points. Smooth, monotone, no clipping unless at the extremes. (−100..+100 each.)
5. **Tone curve (fitted)** — a monotone cubic spline through control points; identity = straight line. In P2 the curve is produced by the fit; manual point editing is deferred.
6. **Vibrance / Saturation** — chroma scaling: Saturation scales chroma uniformly; Vibrance scales nonlinearly (protects already-saturated pixels + skin). Done in a perceptual chroma space. (−100..+100 each.)

Pipeline order, normalization placement, and the RAW/mask insertion points: ARCHITECTURE §1.

## Reference match (the fit)
Goal: given a reference, set ControlParams so the rendered result best approximates the reference's color/tone, with every value visible and tunable. No GPU readback — fits against the analytic forward model of ops 1-6.

1. **Source + reference stats** (`stats.ts`): from a 256px proxy, compute per-channel Lab mean μ, std σ, and a few percentiles (robust to dominant regions — use median/trimmed stats, not raw mean, per the documented Reinhard failure mode).
2. **Target** = the reference stats. **Mood board (multiple refs)** → robust **average** (trimmed mean / median of each channel's μ,σ across refs). **No clustering** in v1.
3. **Closed-form fit** (`fit.ts`), color-homography framing (shading × chromaticity), solved in priority order with light regularization:
   1. chromaticity → **Temp, Tint**
   2. luminance affine (shading) → **Exposure, Contrast, Whites, Blacks**
   3. residual luminance shape → **fitted Tone curve**
   4. chroma spread → **Saturation** (Vibrance left at 0 unless needed)
   Regularize so the L-controls and the curve don't trade off degenerately.
4. **Output** = ControlParams. The render (ARCHITECTURE §1) of those params IS the result. Nothing baked, no hidden layer.
5. **Match strength** = `100 × (1 − normalized residual ΔE)`, surfaced as the ring readout. Residual is whatever the slider basis can't reach; the user closes it (and HSL/color-grading shrink it post-v1).

## Per-image batch normalization
"Apply look to a batch" fits **each image independently to the SAME target μ,σ** from that image's own source stats (ARCHITECTURE §2). Each image gets different Exposure/tone values that all land at the same look → bright frames don't blow out, dark frames don't crush. There is no separate normalization op (nothing to double-count).

## Quality gates (both BLOCKING, step 0)
- **Fidelity:** median ΔE2000(fitted-render, ideal Lab transfer) ≤ 3 on 15+ ref/target pairs. Adversarial pairs with large independent σa vs σb may exceed it (slider basis provably can't match those) — closed later via HSL.
- **Equivalence:** ΔE2000(shaderRender(params), forwardModel(params)) ≤ ε for random params (test-only readback). Stops fit/shader drift.

## Edge cases
σ→0 (flat reference) → clamp divisor + low-confidence flag. Tiny reference → stats from proxy still valid. Out-of-gamut after fit → soft-clip at output. NaN guard on all divisions. Full list: ARCHITECTURE §9.

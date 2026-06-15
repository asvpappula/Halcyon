# Halcyon — PRD

Status: Phase 0 draft (2026-06-14). Companion docs: [design doc](C:\Users\pappu\.gstack\projects\HALCYON\pappu-main-design-20260614-213943.md), [CEO plan](C:\Users\pappu\.gstack\projects\HALCYON\ceo-plans\2026-06-14-halcyon-wedge.md), [research](deep-research-findings.md), [ARCHITECTURE](ARCHITECTURE.md), [DESIGN-SYSTEM](DESIGN-SYSTEM.md), [FEATURES](FEATURES.md).

## Problem
Someone is handed a reference look (a brand mood board) and must make a batch of photos match it, fast, by a deadline — with output they can see and tune. Today they either eyeball it in a two-window Lightroom workflow (slow, and batch apply blows out the bright frames because nothing normalizes per image), or use a one-click tool that hands back a locked LUT/profile they can't audit, or use catalog-trained AI (Imagen/Aftershoot) that they can't use at all because they have no catalog.

## Target user (beachhead)
Content creators and social media managers doing **brand-look matching with no personal catalog to train.** Persona: handed a mood board Monday, needs ~200 photos matching that exact look by Friday, for social. This is the one buyer Imagen, Aftershoot, and Capture One don't court. Wedding photographers are a *later expansion*, not the wedge.

## Value proposition
The free, browser, no-login, no-catalog reference-look match that **decomposes into transparent, individually-editable sliders** and **normalizes per image** so one look fits a whole batch without blowing out the bright frames. North star: *"I saw exactly what it did."*

## Differentiation (honest)
Not "the only editable match" — Capture One Match Look already writes into sliders (desktop, $18–48/mo, RAW/pro, single-image). The moat is **free + browser + no-login + no-catalog + per-image batch normalization + the content-creator segment**, not unique tech. See research findings.

## Success metrics
- **Activation:** an anonymous user drops a reference + batch, gets an editable normalized match, tunes ≥1 slider, and exports — in under ~2 minutes, no login.
- **Engine fidelity:** median ΔE2000 (fitted-render vs ideal Lab transfer) ≤ 3 on the test set; shader↔forward-model equivalence within ε (both blocking gates).
- **Trust:** rendered image is always the slider stack — no hidden layer.
- **Batch quality:** no blown-out/crushed outliers across a 10+ image mixed-exposure batch.
- **Validation (gate before building deferred scope):** a concrete anon→signup conversion + 7-day return threshold, fixed from the first ~2 weeks of funnel data (CEO plan).

## Non-goals (v1)
Not a Lightroom clone. Deferred (see [TODOS](../TODOS.md)): full develop toolkit (HSL, color grading, detail/NR, vignette/grain, geometry, manual/per-channel curves), library/collections/ratings, presets, .cube LUT import, accounts/Supabase/RLS, the cinematic GSAP/Three.js landing, RAW decode, AI masking, wedding-photographer features.

## Key risks
1. Demand in the new beachhead is N≈0 until validated — **pre-build gate: 5 user interviews** (office-hours assignment).
2. Engine fidelity (analytic fit) is unproven IP — **pre-build gate: the fidelity + equivalence spike.**
3. Free tools (color.io/Polarr) could add batch + editability from below — speed to the segment matters.

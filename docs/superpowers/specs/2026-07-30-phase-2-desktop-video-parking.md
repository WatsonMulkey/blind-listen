# Blind Listen — Phase 2 Parking Doc (Desktop App + Video Auditioner)

**Date parked:** 2026-07-30
**Status:** PARKED by Watson ("document all of this for now to pick up later") — nothing here is in build.
**Companion docs:** Phase 1 spec `2026-07-30-monetization-experiment-design.md` + plan `../plans/2026-07-30-monetization-experiment.md` (both committed, execution NOT started).

## Where the session ended

Phase 1 (web monetization experiment) is fully specced and planned, awaiting two Watson inputs to start:
1. Execution approach — subagent-per-task (recommended) vs. inline.
2. Polar **sandbox** setup (his hands-on learning goal): org + $5/$19 one-time products + checkout links + access token → Vercel env vars; PostHog free key.

Phase 2 (this doc) emerged mid-session and is deliberately parked so Phase 1 isn't delayed or muddied.

## Decision ledger

**DECIDED (Watson):**
- Desktop platform scope v1: **Windows first**; site says "macOS on request" and we measure demand (itself case-study data).
- Phase 1 web experiment: approved as specced ($5 extension + $19 lifetime + 6:00 gate; close-session routes through reveal).

**PROPOSED, NOT CONFIRMED (Watson skipped the question — re-ask at pickup):**
- **Desktop replaces web Pro**: web = free 6:00 sessions + $5 extension only; every $19 surface sells the desktop app; license-key infra (validate endpoint, 7-day grace, localStorage license) gets DELETED, not defended. Claude's recommendation.
- Sequencing: Phase 1 ships now as planned (license-key Pro included); Phase 2 later retires it in favor of the download. The experiment log narrates the pivot — it strengthens the case study.
- Signing path: Azure Trusted Signing (~$10/mo) once FOIL's EIN lands (Watson answered "curious to learn more" — explainer below was delivered; no commitment made).

**OPEN:**
- Video spike: Claude offered a standalone HTML proof (one video + 3 swappable audio tracks + drift correction, an afternoon, delivered to Watson's browser, zero changes to the real app). No answer yet.
- Pricing when video lands: is desktop-with-video still $19, or does it justify more? Untouched.
- macOS timing trigger: what demand signal flips it on?

## The video auditioner idea (Watson's, verbatim intent)

"A video player also linked to the start button, so people could audition sounds or music to TV/movies. Even beyond not knowing which file, this might be useful for its ability to quickly switch ideas tied to video."

**Assessment (Claude, 2026-07-30):** possibly bigger than the blind feature. Serves composers A/B-ing cue candidates against a scene, musicians pitching sync, sound designers swapping ambience beds, editors comparing temp-score options — workflows currently done clumsily inside NLEs/DAWs, never blind, never instant-switch. "Load a scene, load 3 cues, switch instantly while picture rolls" is a genuinely new speed.

**Technical read:**
- Muted `<video>` element = master clock; existing Web Audio engine slaves candidate audio to it and swaps under rolling picture. Current architecture already switches mixes at the same timeline position — the bones fit.
- Sync target ~±30ms with periodic drift correction: right for auditioning feel, NOT frame-accurate conform (different product; don't chase it).
- Browsers won't decode ProRes/MOV masters → users load the H.264 review copy they already make. Say so in UI copy.
- Cues need a start-offset relative to picture; v1 = one offset field, nothing more.
- Sizing: a few days. Touches `js/audio-engine.js` — the riskiest core file. This is WHY it's parked behind Phase 1, not bolted on.

**Product placement (proposed):** flagship feature of the $19 desktop app — turns desktop from "web minus timer" into a real product: *"compare mixes blind, audition against picture, offline, yours forever, no account, no telemetry."*

## Desktop app (proposed shape)

- **Tauri v2** wrapper (~10MB installer, Windows WebView2 = Chromium so Web Audio behaves) — NOT Electron (~150MB). App is already a zero-build static bundle; near-perfect wrap candidate.
- Vendor the one CDN dep (jsPDF) for offline.
- Desktop build strips: session timer/gate, checkout client, analytics. Ships Task 8's Pro timer (elapsed count-up + 20:00 ear-fatigue nudge) as permanent behavior. **No telemetry in the paid app** — it's a selling line and a case-study contrast.
- Delivery: Polar **Downloadables** benefit (buy → download the installer). No license server at all.
- Trust copy carries the free web app too (it's already true, costs nothing): "100% in your browser — we never see your audio."

## Code signing explainer (delivered to Watson 2026-07-30)

Windows checks two things on a downloaded exe: **identity** (cryptographic signature tying the file to a validated publisher) and **reputation** (SmartScreen's accumulated trust). Unsigned fails both → full-screen "Windows protected your PC" scare on every install — disqualifying for a trust-positioned product.

| Option | Cost | Reality |
|---|---|---|
| **Azure Trusted Signing** (recommended) | ~$10/mo | Microsoft-validated identity, reputation effectively immediate, CI-friendly. **Requires a verifiable legal entity → FOIL's EIN (still pending).** |
| Traditional OV cert | $100–400/yr | Hardware-token key custody (post-2023 CA rules); reputation builds slowly — signed but still scary for weeks. |
| EV cert | $300–500/yr | Near-instant reputation; overkill vs. Azure at this scale. |
| Unsigned | $0 | Every buyer sees the scare screen + click-through instructions. Undercuts the whole pitch. |
| (Footnote) Microsoft Store | $19–99 one-time | Sidesteps SmartScreen entirely, but complicates selling via Polar. Noted, not recommended. |

**Cross-project consequence: FOIL's EIN is now revenue-blocking** (desktop launch sequences behind it). Flagged for FOIL ops prioritization — the EIN was already "next after the Operating Agreement signature" (BIZ-ADR-002).

## Pickup checklist (in order)

1. Watson: execution approach for Phase 1 (subagent-driven recommended) → run the plan.
2. Watson: Polar sandbox + PostHog setup (guided; Tasks 1–5 don't block on it).
3. Re-ask the skipped structure question: does desktop replace web Pro? (Claude recommends yes.)
4. Decide the video spike (cheap de-risk, recommended before any Phase 2 design).
5. When EIN lands: attempt Azure Trusted Signing validation → THEN brainstorm→spec→plan Phase 2 properly (new ADR; this doc is input, not a spec).
6. Local repo state at parking: `main` has 5 unpushed docs-only commits (`379d9e5`…`053998c` + this one). **Pushing deploys** (docs are harmless but it's Watson's call per house rule).

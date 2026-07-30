# Blind Listen Monetization Experiment — Design

**Date:** 2026-07-30
**Status:** Draft — awaiting Watson review
**Relations:** Builds on ADR-005 (paid-tier sketch). Supersedes two of its resolutions: (1) the soft-stop-at-0:00 timer behavior, (2) the Supabase-Auth-based Phase 2 architecture. The Phase 2 "active users first" gate is consciously overridden: the goals have changed — the build itself (payments-stack learning) and the published story (FOIL case study) are the point; demand-proof is now an *output* of the experiment, not a precondition.

## 1. Goals

1. **Learn the payments stack hands-on** — Polar.sh (merchant of record), hosted/embedded checkout, server-side purchase verification, license keys, entitlement gating — on a low-stakes property.
2. **Produce a FOIL case study** — a creative, honest monetization design plus real funnel numbers, published on foil.engineering (ties into the FOI-387 unbundle motion).
3. Revenue itself is tertiary.

**Non-goals (out of scope):** accounts/auth (no Supabase), subscriptions, Session Mode (Phase 3), shrinking the free session below 10:00, page-reset enforcement, blind-pricing A/B testing (candidate follow-up experiment #2), refund flows beyond Polar defaults.

## 2. Offer structure

| Product | Price | Type | Grants |
|---|---|---|---|
| **Session Extension** | $5 | One-time, session-scoped | +10:00 on the current session's countdown. Stackable (re-buyable at each expiry). Does **not** survive reload or a new session — disclosed in modal microcopy ("this session only"). |
| **Pro (Lifetime)** | $19 | One-time, license key | Timer removed (elapsed count-up shown instead) + LUFS metering + lock-in reshuffle + PDF export. Permanent; key re-enterable in any browser. |

**Anchoring rationale (deliberate, disclosed in the case study):** the $5 extension functions partly as a decoy/anchor — four overtime sessions cost more than lifetime, so presenting both makes $19 read as obviously correct. One-time pricing (no subscription) is itself a differentiator for a subscription-fatigued audio audience.

**Free tier** — unchanged except the timer-end enforcement in §3: 10:00 session, blind comparison of 2–5 mixes, looping, level matching (stays free; only the numeric LUFS *metering display* is gated), notes, reveal, basic reshuffle, text export, unlimited new sessions.

## 3. Timer-end mechanic (the one real free-tier behavior change)

- Countdown, thresholds, and screen-reader announcements unchanged (amber at 2:00, critical at 0:30).
- **At 0:00: playback pauses (as today) and a gate modal appears (new).** Listening cannot continue *within this session* without a purchase — this replaces today's silent press-play-to-continue, which made the timer purely advisory and would make a paid extension meaningless.
- Modal contents (every interaction tracked): primary buttons **[Add 10 minutes — $5]** and **[Pro forever — $19]**; quiet free links **[Reveal & wrap up]** and **[Start a new session]**; dismissible (×/Esc).
- Dismissing returns to the ended state: transport disabled, but reveal, notes, text export, and new-session remain fully available. Modal re-openable via the timer badge.
- **No page reset, ever.** Buffers, shuffle, and notes are always preserved. A reset would invalidate the blind test (data loss mid-experiment) *and* destroy the purchasable moment — the gate achieves the monetization without either.
- Accessibility: focus-trapped modal, Esc to dismiss, announcements via the existing `srAnnouncer` element.
- **Pro behavior:** countdown replaced by an elapsed count-up; one gentle, non-blocking ear-fatigue nudge (toast) at 20:00 per session — the tool keeps its opinion without a gate.
- **Extension behavior:** countdown resets to 10:00; at the next 0:00 the gate re-fires (repeat purchase allowed).

## 4. Payments architecture

- **Provider:** Polar.sh — merchant of record (handles tax/VAT), ADR-005's original pick. Two one-time products as in §2; Pro carries a License Key benefit.
- **Hard constraint: checkout must not unload the session page** — the app holds decoded AudioBuffers in memory. Preferred: Polar embedded/overlay checkout if the current API supports it; fallback: open hosted checkout in a new tab → on success the original tab polls `/api/checkout-status?id=…` → Vercel function verifies the checkout with the Polar API → grant applied. Verify which path Polar supports at implementation time.
- **Session Extension grant:** server-verified once, then in-memory `sessionSeconds += 600` (+ event). No persistence by design.
- **Pro grant:** license key from Polar → stored in `localStorage` → validated on app load via `/api/validate-license` (Vercel function; Polar secret lives server-side only). Last-good validation cached 7 days for offline grace. Manual "Enter license key" input for additional browsers.
- **Enforcement honesty:** all gates are client-side and devtools-bypassable. Accepted trade-off at these stakes ("keeps honest people honest"), and stated openly in the case study.
- **New infrastructure:** an `api/` directory (this project's first Vercel serverless functions) and Polar API secret in Vercel env vars. No database, no auth.

## 5. Instrumentation (the case-study data)

Events: `session_start`, `timer_warning`, `timer_end`, `gate_shown` (trigger: `timer|lufs|lockin|pdf`), `extend_clicked`, `pro_clicked`, `checkout_opened` (product), `checkout_completed` (product), `wrapup_clicked`, `new_session_clicked`, `license_activated`.

- **Sink:** Vercel Web Analytics custom events if the current plan supports them; otherwise PostHog free tier. Decide at implementation after checking the Vercel plan — either is a one-file change.
- **Revenue truth:** the Polar dashboard.
- **Funnel for the write-up:** visits → sessions → timer_end → gate_shown → paid clicks → completed, split by product, plus feature-gate-triggered vs. timer-triggered purchases.
- Ad-blocker event loss accepted and noted in the write-up.

## 6. Feature gates (Pro purchase surfaces)

- **LUFS metering panel:** lock badge, meters disabled → click opens the gate modal (trigger=`lufs`).
- **Lock-in reshuffle:** badge on the control → modal (trigger=`lockin`).
- **PDF export:** badge on the button → modal (trigger=`pdf`). Text export stays free — the free wrap-up path keeps full note takeaway.
- `PAID_GATE` markers are already sited in `js/metering.js`, `js/ui.js`, `js/export.js` (per project CLAUDE.md) — implementation hooks pre-placed.

## 7. Case-study log & write-up

- `docs/experiment-log.md` in this repo, updated at every milestone: decisions and why, screenshots, numbers. Written as it happens (recorder discipline), never reconstructed.
- Measurement window: 4–6 weeks post-launch, or 100 `timer_end` events, whichever comes first → write-up published on foil.engineering.
- Honest framing: traffic will likely be small-n; the story's spine is the method, the build, and the real numbers — not statistical significance.

## 8. Distribution beat

Results require traffic. Post-ship launch push — channel selection is Watson's call at launch time (candidates: r/audioengineering, r/WeAreTheMusicMakers, Gearspace, Show HN). Not blocking the build.

## 9. Testing

- New logic units — timer/gate state machine, entitlement store, license-validation function — get tests in the existing harness (`test-runner.html` / `scripts/ci-run-tests.mjs`). CI test-count floor is additive-only (ADR-033).
- Manual QA checklist includes: gate fires at 0:00; all dismiss paths; extension credit applies and stacks; reload behavior (extension lost, Pro retained); new-tab checkout return flow; offline license grace; modal a11y.

## 10. Rollout / workflow protocol

1. **Watson prerequisite:** create the Polar org, the two products, and an API token (guided — this is part of the learning goal).
2. **New workspace ADR** (claim number in `Dev/docs/decisions/INDEX.md` in the same commit): records the supersession of ADR-005's soft-stop, the Phase-2-gate override rationale, and the no-Supabase decision.
3. **Linear:** re-scope FOI-30 (drop Supabase Auth; this experiment) or open child tickets under it.
4. Implementation plan via writing-plans → build → deploy (verify `.vercel/project.json` projectId per project CLAUDE.md) → `/close-out`.

## 11. Open questions

None blocking. Modal copy tone is drafted at implementation and tweakable at visual review.

# Blind Listen Monetization Experiment — Design

**Date:** 2026-07-30
**Status:** Draft — awaiting Watson review
**Relations:** Builds on ADR-005 (paid-tier sketch). Supersedes three of its resolutions: (1) the 10:00 free session length (now 6:00), (2) the soft-stop-at-0:00 timer behavior, (3) the Supabase-Auth-based Phase 2 architecture. The Phase 2 "active users first" gate is consciously overridden: the goals have changed — the build itself (payments-stack learning) and the published story (FOIL case study) are the point; demand-proof is now an *output* of the experiment, not a precondition.

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

**Free tier** — 6:00 session (shortened from 10:00 — rationale in §3), blind comparison of 2–5 mixes, looping, level matching (stays free; only the numeric LUFS *metering display* is gated), notes, reveal, basic reshuffle, text export, unlimited new sessions (via close/refresh).

## 3. Timer-end mechanic (the free-tier behavior changes)

- **Free session length: 6:00** (`sessionSeconds = 360`, init + reset sites in `js/app.js`) — shortened from 10:00 as part of this experiment. Two honest notes, both destined for the case study: (a) this is a free-tier reduction relative to the shipped tool — disclosed, not hidden; (b) it materially raises gate exposure: at 10:00 most sessions likely finish before the timer fires, so the gate would rarely be seen; at 6:00 the gate — the thing the experiment measures — actually gets impressions.
- Countdown thresholds and screen-reader announcements unchanged (amber at 2:00, critical at 0:30 — proportions still sensible at 6:00).
- **At 0:00: playback stops and the "Time's up" modal appears.** Continued listening within this session is paid-only — this replaces today's silent press-play-to-continue, which made the timer purely advisory and would make a paid extension meaningless.
- Modal — exactly three options (every interaction tracked):
  1. **Add 10 more minutes — $5**
  2. **Buy lifetime license — $19** (copy lists: no timer, LUFS metering, lock-in reshuffle, PDF export)
  3. **Close session**
- **Close session routes through the reveal before clearing** — the one deliberate deviation from "refresh immediately," awaiting Watson's confirmation: if the session is un-revealed, Close first shows the standard reveal screen (identities + notes + free text export), then a "Done — clear session" action performs the page refresh. Reason: a raw refresh on an un-revealed session destroys the blind test's payoff and the user's notes, and neither paid option claims to sell the reveal — so withholding it would be an accident, not a mechanic. Monetization is identical either way (no free listening past 6:00). If already revealed, Close refreshes directly. The refresh doubles as the free new-session path (fresh upload screen, fresh 6:00).
- Modal a11y: focus-trapped; Esc/× dismisses to the ended state (transport locked; timer badge re-opens the modal). Dismissal sells nothing short — it's "let me think" — and WCAG requires an escape hatch. Announcements via the existing `srAnnouncer` element.
- **Pro behavior:** countdown replaced by an elapsed count-up; one gentle, non-blocking ear-fatigue nudge (toast) at 20:00 per session — the tool keeps its opinion without a gate.
- **Extension behavior:** countdown resets to 10:00 of granted time; at the next 0:00 the gate re-fires (repeat purchase allowed).

## 4. Payments architecture

- **Provider:** Polar.sh — merchant of record (handles tax/VAT), ADR-005's original pick. Two one-time products as in §2; Pro carries a License Key benefit.
- **Hard constraint: checkout must not unload the session page** — the app holds decoded AudioBuffers in memory. Preferred: Polar embedded/overlay checkout if the current API supports it; fallback: open hosted checkout in a new tab → on success the original tab polls `/api/checkout-status?id=…` → Vercel function verifies the checkout with the Polar API → grant applied. Verify which path Polar supports at implementation time.
- **Session Extension grant:** server-verified once, then in-memory `sessionSeconds += 600` (+ event). No persistence by design.
- **Pro grant:** license key from Polar → stored in `localStorage` → validated on app load via `/api/validate-license` (Vercel function; Polar secret lives server-side only). Last-good validation cached 7 days for offline grace. Manual "Enter license key" input for additional browsers.
- **Enforcement honesty / threat model:** all gates are client-side and devtools-bypassable. Accepted trade-off at these stakes ("keeps honest people honest"), and stated openly in the case study. The distinction that keeps this out of vibe-code-security territory: bypass = **revenue leakage** (a non-buyer listens free), never a **breach** — there are no accounts, no PII, no server database, audio never leaves the browser, prices live in Polar's hosted checkout (client never sends a price), the Polar token is server-side only, and grants only follow server-side verification of a completed checkout. Deleting the modal does NOT unlock playback (the lock is app state, not DOM). Tampering we can't prevent we **measure**: a `gate_bypassed` telemetry flag fires when the timer has ended but playback resumes with restored seconds and no verified grant — the case study reports a bypass rate instead of pretending it's zero.
- **New infrastructure:** an `api/` directory (this project's first Vercel serverless functions) and Polar API secret in Vercel env vars. No database, no auth.

## 5. Instrumentation (the case-study data)

Events: `session_start`, `timer_warning`, `timer_end`, `gate_shown` (trigger: `timer|lufs|lockin|pdf`), `gate_dismissed` (trigger — the Esc/× "let me think" path; an immediate dismiss-then-close pattern is the rage-quit signal), `extend_clicked`, `pro_clicked`, `checkout_opened` (product), `checkout_completed` (product), `close_session_clicked` (with `revealed: true|false`), `license_activated`, `gate_bypassed` (tamper telemetry, once per session).

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
- Manual QA checklist includes: gate fires at 0:00 of a 6:00 session; Esc/× dismiss path; Close on an un-revealed session routes through reveal then refreshes; Close on a revealed session refreshes directly; extension credit applies and stacks; reload behavior (extension lost, Pro retained); new-tab checkout return flow; offline license grace; modal a11y.
- **UX test plan** (pre-launch, on the preview deploy):
  - **Time-warp param**: `?t=<seconds>` shortens the free session on localhost/preview hosts only (never honored on production hostnames), so the gate is reachable in seconds, repeatedly.
  - **Adversarial half-hour** (Watson as hostile user, scripted): delete the modal in DevTools, restore `sessionSeconds`, forge the `bl_license` localStorage entry, block the `/api/*` calls, block PostHog. Expected results per attack are written down beforehand; every outcome must be leakage-only (free listening), never a broken purchase, a stuck UI, or a fake Pro that survives revalidation. Findings go in the experiment log as the case study's threat-model section.
  - **Cold-eyes hallway test**: 1–2 producer friends hit the gate with no briefing; record reactions verbatim (recorder mode) — the gate moment's emotional tone is the top UX risk of the whole experiment.
  - **Funnel telemetry as ongoing UX test**: `gate_shown → gate_dismissed / close_session_clicked / extend_clicked / pro_clicked` ratios; instant dismiss-then-close reads as rage-quit.
  - A11y pass (keyboard-only + screen reader) and a small-screen check of the modal.
- Existing timer tests asserting the 600-second default must be updated to 360 — a legitimate behavior-change edit (test *count* floor unaffected; the ADR-033 test-edit ask-gate may prompt).

## 10. Rollout / workflow protocol

1. **Watson prerequisite:** create the Polar org, the two products, and an API token (guided — this is part of the learning goal).
2. **New workspace ADR** (claim number in `Dev/docs/decisions/INDEX.md` in the same commit): records the supersession of ADR-005's soft-stop, the Phase-2-gate override rationale, and the no-Supabase decision.
3. **Linear:** re-scope FOI-30 (drop Supabase Auth; this experiment) or open child tickets under it.
4. Implementation plan via writing-plans → build → deploy (verify `.vercel/project.json` projectId per project CLAUDE.md) → `/close-out`.

## 11. Open questions

- **Awaiting Watson's confirm (non-blocking, one-line revert):** Close Session routes through the reveal before refreshing (§3), rather than refreshing immediately.
- Modal copy tone is drafted at implementation and tweakable at visual review.
- **Phase 2 direction parked 2026-07-30** (desktop app + video auditioner; the $19 tier may later become a downloadable exe and retire the license-key infra) → see `2026-07-30-phase-2-desktop-video-parking.md` before implementing Task 6/7, in case that decision has since landed.

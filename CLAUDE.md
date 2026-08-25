# Blind Listen — Blind Mix Comparison Tool

## Status: Active — Phase 1 + v1.1.0 live; monetization experiment (v1.2.0) BUILT on branch `watson/monetization-experiment` 2026-08-25 — awaiting Polar sandbox E2E, QA sweep, adversarial pass, hallway test, and Watson's visual review before merge to main. Not yet in production. Log: `docs/experiment-log.md`.

## What This Is
Browser-based blind listening test for comparing audio mixes. Load 2–5 audio files, switch between them with hidden identities, loop sections, jot notes, then reveal. Features LUFS metering, level matching, spectrogram, lock-in reshuffle, reference track, and text/PDF export. Free tier is 100% client-side (no server, no cost). Paid tier and Session Mode add backend when demand proves out.

## Stack
- **Phase 1 (current)**: HTML + CSS + vanilla JavaScript + Web Audio API (split into `js/` modules) + Polar.sh payments + zero-dependency Vercel serverless functions (`api/`) + PostHog-optional analytics (`js/analytics.js`, no-op until `POSTHOG_KEY` is set)
- **Phase 3 (future)**: + Cloudflare R2 (file sharing) + Supabase Realtime (session sync)
- No build step. No framework. Only CDN dependency: jsPDF for PDF export.
- Auth deliberately absent — ADR-037 (accounts deleted, not deferred; entitlement is a Polar license key, not a user account).

## Deployment
- Vercel project: `blind-listen` (auto-deploys from GitHub on push to main)
- Direct URL: `https://blind-listen.vercel.app`
- Proxied via rewrite in `foil-industries-v2/vercel.json` → `foil.engineering/blindlisten`
- Also served at `https://blindlisten.foil.engineering` — a domain alias on the
  same Vercel project (byte-identical content, verified 2026-08-24); a third
  origin for CORS/postMessage rosters (`js/app.js` PROD_HOSTS, `api/_polar.mjs`
  ALLOWED_ORIGINS, `checkout-success.html` postMessage targets)
- Same pattern as TheNumber
- CRITICAL: Always verify `.vercel/project.json` has correct projectId before deploying
- `.vercelignore` excludes `docs/` and `.superpowers/` from the public deploy — planning docs and specs never ship.

## Key Files
- `index.html` — HTML + CSS + `<script>` tags
- `js/app.js` — State globals, DOM refs, file upload, initialization
- `js/audio-engine.js` — AudioContext, play/pause/stop/seek/switch, gain routing
- `js/waveform.js` — Waveform + spectrogram canvas rendering
- `js/loop.js` — Loop controls, markers, re-roll
- `js/metering.js` — ITU-R BS.1770-4 LUFS, RMS, peak, level matching
- `js/timer.js` — Session countdown timer
- `js/ui.js` — buildUI, buttons, reveal, reshuffle, notes, keyboard, ref track
- `js/export.js` — Text + PDF export
- `js/config.js` — Experiment config: `POLAR_ENV`, checkout links, `API_BASE`, `POSTHOG_KEY`
- `js/analytics.js` — PostHog wrapper (`track()`), no-op until `POSTHOG_KEY` is set
- `js/entitlements.js` — Tier model (free/pro), license cache, gate/timer pure helpers
- `js/gate-modal.js` — Paywall modal (timer + feature triggers), wrap-up bar, dismissal
- `js/checkout.js` — Checkout open + cross-origin dual-channel verification, license activation
- `api/` — Vercel serverless functions: `validate-license.mjs`, `checkout-status.mjs`, `_polar.mjs` (shared Polar client — POLAR_ACCESS_TOKEN lives only here)
- `checkout-success.html` — Polar checkout return page; posts the checkout id back to the opener tab
- `../docs/decisions/005-blind-listen-architecture.md` — ADR (comprehensive)

## How to Use (local dev)
1. Open `index.html` in any modern browser (double-click works)
2. Drag & drop 2–5 audio files (WAV, MP3, FLAC, M4A)
3. Files randomly assigned to X/Y/Z/W/V buttons
4. Switch mixes — playback position stays synced
5. Optional: Add a reference track (REF button), toggle level matching
6. Lock a pick, reshuffle, re-listen for consistency check
7. Jot notes, then click Reveal
8. Export results as text or PDF

## Keyboard Shortcuts
- `1/2/3/4/5` — Switch to mix X/Y/Z/W/V
- `0` — Switch to reference track
- `Space` — Play/pause
- `L` — Toggle loop
- `M` — Toggle level matching
- `R` — Reveal

## Monetization Gates (live, v1.2.0)
Free sessions run 6:00 (`FREE_SESSION_SECONDS`, `js/entitlements.js`); at 0:00 the gate modal (`js/gate-modal.js`) offers a $5 / +10:00 extension, $19 lifetime Pro, or close-session (always routes through reveal first — an unfinished blind test is never eaten). Pro removes the timer for good and unlocks:
- `js/metering.js` — `renderMixStats()` numeric LUFS/peak/RMS display (computation itself stays free)
- `js/ui.js` `toggleLock()` — lock-in pick + reshuffle consistency check
- `js/export.js` — PDF export (`exportPdfBtn`); text export stays free at every tier

Entitlement is a Polar license key in `localStorage` (`bl_license`), revalidated server-side with a 7-day offline grace (`js/entitlements.js`, `js/checkout.js`). Gates are client-side and DevTools-bypassable — an accepted trade-off (spec §4); bypass is measured via `gate_bypassed` telemetry, not prevented.

**Vercel env vars** (server-side, `api/`): `POLAR_ACCESS_TOKEN`, `POLAR_ORG_ID`, `POLAR_PRODUCT_EXTEND_ID`, `POLAR_PRODUCT_PRO_ID`, `POLAR_ENV` (`sandbox` | `production`).
**Client-side config** (`js/config.js`): `POSTHOG_KEY` (empty = analytics disabled) and the two Polar checkout links (`CHECKOUT_LINK_EXTEND`, `CHECKOUT_LINK_PRO`).

**Sandbox → production flip (launch-day, do together in one commit):** swap `js/config.js` (`POLAR_ENV`, both checkout links, `POSTHOG_KEY`) to production values AND the matching Vercel env vars to production Polar credentials — never one without the other, or checkout links and the server verifying them will point at different Polar environments.

## Linear Tickets
- FOI-27: Requirements + ADR
- FOI-28: Phase 1A — Deploy MVP to Vercel + foil.engineering rewrite
- FOI-29: Phase 1B — Enhanced free tier (looping, waveform, upload UX)
- FOI-30: Phase 2 — re-scoped to the monetization experiment (v1.2.0, no accounts — see ADR-037): Polar.sh session extension + lifetime Pro, gating LUFS metering/lock-in reshuffle/PDF export
- FOI-31: Phase 3 — Session Mode (R2, Realtime, voting)

## Phase Gates
- Phase 2 gate: Do not start until free tier has active users
- Phase 3 gate: Do not start until paid tier has subscribers requesting collaboration

## Known MVP Issues (from skeptic review)
- [x] Silent `try/catch` in `stop()` — now logs console.warn
- [x] `duration = Math.max(...)` — fixed: seek bar uses active buffer's duration via `getActiveDuration()`
- [x] No loading indicator during decode — per-file spinners + status text (FOI-34)
- [x] File limit is 4, should be 5 — now supports 2-5 files
- [x] No per-file upload confirmation — file list shows name, size, status per file (FOI-34)
- [x] AudioContext created before user interaction — resume() called on play click (FOI-34)

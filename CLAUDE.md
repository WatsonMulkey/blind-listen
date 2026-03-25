# Blind Listen — Blind Mix Comparison Tool

## Status: Active — ADR complete, MVP built, pending deploy to Vercel

## What This Is
Browser-based blind listening test for comparing audio mixes. Load 2–5 audio files, switch between them with hidden identities, loop sections, jot notes, then reveal. Free tier is 100% client-side (no server, no cost). Paid tier and Session Mode add backend when demand proves out.

## Stack
- **Phase 1 (current)**: Single `index.html` — HTML + CSS + vanilla JavaScript + Web Audio API
- **Phase 2 (future)**: + Supabase Auth + Stripe Checkout + Vercel serverless functions
- **Phase 3 (future)**: + Cloudflare R2 (file sharing) + Supabase Realtime (session sync)
- No build step in Phase 1. No framework. No dependencies.

## Deployment
- Vercel project: `blindlisten` (not yet created)
- Proxied via rewrite in `foil-industries-v2/vercel.json` → `foil.engineering/blindlisten`
- Same pattern as TheNumber
- CRITICAL: Always verify `.vercel/project.json` has correct projectId before deploying

## Key Files
- `index.html` — The entire Phase 1 application
- `../docs/decisions/005-blind-listen-architecture.md` — ADR (comprehensive)

## How to Use (local dev)
1. Open `index.html` in any modern browser (double-click works)
2. Drag & drop 2–5 audio files (WAV, MP3, FLAC, M4A)
3. Files randomly assigned to X/Y/Z/W/V buttons
4. Switch mixes — playback position stays synced
5. Jot notes, then click Reveal

## Keyboard Shortcuts
- `1/2/3/4/5` — Switch to mix X/Y/Z/W/V
- `Space` — Play/pause
- `R` — Reveal
- `L` — Toggle loop (Phase 1B)

## Linear Tickets
- FOI-27: Requirements + ADR
- FOI-28: Phase 1A — Deploy MVP to Vercel + foil.engineering rewrite
- FOI-29: Phase 1B — Enhanced free tier (looping, waveform, upload UX)
- FOI-30: Phase 2 — Paid tier (Supabase Auth, Stripe, LUFS metering)
- FOI-31: Phase 3 — Session Mode (R2, Realtime, voting)

## Phase Gates
- Phase 2 gate: Do not start until free tier has active users
- Phase 3 gate: Do not start until paid tier has subscribers requesting collaboration

## Known MVP Issues (from skeptic review)
- [ ] Silent `try/catch` in `stop()` — should log errors
- [ ] `duration = Math.max(...)` — seek bar shows longest file's duration even when shorter file is active
- [ ] No loading indicator during decode — large WAVs take seconds
- [ ] File limit is 4, should be 5
- [ ] No per-file upload confirmation
- [ ] AudioContext created before user interaction (autoplay policy risk)

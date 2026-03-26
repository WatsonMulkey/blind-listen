# Blind Listen — Blind Mix Comparison Tool

## Status: Active — Full feature build complete, ready for demo

## What This Is
Browser-based blind listening test for comparing audio mixes. Load 2–5 audio files, switch between them with hidden identities, loop sections, jot notes, then reveal. Features LUFS metering, level matching, spectrogram, lock-in reshuffle, reference track, and text/PDF export. Free tier is 100% client-side (no server, no cost). Paid tier and Session Mode add backend when demand proves out.

## Stack
- **Phase 1 (current)**: HTML + CSS + vanilla JavaScript + Web Audio API (split into `js/` modules)
- **Phase 2 (future)**: + Supabase Auth + Polar.sh payments + Vercel serverless functions
- **Phase 3 (future)**: + Cloudflare R2 (file sharing) + Supabase Realtime (session sync)
- No build step. No framework. Only CDN dependency: jsPDF for PDF export.

## Deployment
- Vercel project: `blind-listen` (auto-deploys from GitHub on push to main)
- Direct URL: `https://blind-listen.vercel.app`
- Proxied via rewrite in `foil-industries-v2/vercel.json` → `foil.engineering/blindlisten`
- Same pattern as TheNumber
- CRITICAL: Always verify `.vercel/project.json` has correct projectId before deploying

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

## PAID_GATE Locations
Gate points for future monetization (currently all ungated):
- `js/metering.js` — LUFS metering
- `js/ui.js` — Lock-in reshuffle
- `js/export.js` — PDF export

## Linear Tickets
- FOI-27: Requirements + ADR
- FOI-28: Phase 1A — Deploy MVP to Vercel + foil.engineering rewrite
- FOI-29: Phase 1B — Enhanced free tier (looping, waveform, upload UX)
- FOI-30: Phase 2 — Paid tier (Supabase Auth, Polar.sh, LUFS metering)
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
